import { basename, dirname } from "node:path";
import type {
	ArmGroupRequest,
	ExtensionPlan,
} from "#benchmark/compare-attempts";
import { compareAttempts, extendComparison } from "#benchmark/compare-attempts";
import type { ApprovalMethod, ReplayCliConfig } from "#benchmark/config";
import { recordsDirectory } from "#benchmark/config";
import type { ComparisonArm } from "#benchmark/comparison-record";
import { unhandled } from "#benchmark/contracts";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { benchmarkRunPaths } from "#benchmark/run-layout";
import { UsageError } from "#cli/commands";
import { requireInteractiveStdin } from "#cli/interactive-stdin";
import { writeRecord } from "#cli/output";
import type { ReplayCommandDependencies } from "#cli/replay-command";
import { replayConfig, runReplayCommand } from "#cli/replay-command";

export interface ArmReplayRequest {
	readonly approval: ApprovalMethod;
	readonly stdinIsTerminal: boolean;
}

function approvalArguments(approval: ApprovalMethod): readonly string[] {
	switch (approval) {
		case "interactive": {
			return [];
		}
		case "yes": {
			return ["--yes"];
		}
		case "browser": {
			return ["--yes", "--approved-in-browser"];
		}
		default: {
			return unhandled(approval, "approval method");
		}
	}
}

function armReplayArguments(
	arm: Readonly<ArmGroupRequest>,
	approval: ApprovalMethod,
): string[] {
	return [
		"--run",
		arm.run,
		"--stage",
		arm.stage,
		"--corpus",
		arm.corpusDirectory,
		"--model",
		arm.model,
		...(arm.effort === undefined ? [] : ["--effort", arm.effort]),
		"--judge-model",
		arm.judgeModel,
		...(arm.judgeEffort === undefined
			? []
			: ["--judge-effort", arm.judgeEffort]),
		"--session-budget-usd",
		String(arm.sessionBudgetUsd),
		"--confirm",
		"--reps",
		String(arm.reps),
		...(arm.withoutStageSkill ? ["--without-stage-skill"] : []),
		...approvalArguments(approval),
	];
}

const CONTROLLED_KNOBS = [
	"model",
	"effort",
	"judgeModel",
	"judgeEffort",
	"sessionBudgetUsd",
] as const;

/** The arm as the operator named it: the harness's control is the operator's baseline arm. */
const ARM_LABELS = {
	baseline: "arm A",
	candidate: "arm B",
	control: "baseline",
} as const satisfies Record<ComparisonArm, string>;

/**
 * Replay fills a knob its flags leave out from the environment, and a Judge
 * effort from the worker's, so an arm's replay can resolve to inputs arm A
 * never ran. Its group would then be refused by the comparison only after it
 * was paid for, so the difference is refused before replay probes the model.
 */
function assertRunsArmAInputs(
	arm: Readonly<ArmGroupRequest>,
	config: Readonly<ReplayCliConfig>,
): void {
	for (const knob of CONTROLLED_KNOBS) {
		if (config[knob] !== arm[knob]) {
			throw new RefusedPreconditionError(
				`the ${ARM_LABELS[arm.role]} replay would run ${knob} ${String(config[knob])} where arm A recorded ${String(arm[knob] ?? "none")}, so its group could not be compared`,
			);
		}
	}
}

/**
 * Runs a comparison arm's group through replay itself, so it meets the same
 * spend ceiling, model probe and cost approval as any replay. Replay's record
 * goes to stderr, since the comparison's report owns stdout.
 */
export function replayArmGroup(
	request: ArmReplayRequest,
	dependencies: ReplayCommandDependencies,
): (arm: ArmGroupRequest) => Promise<string> {
	return async (arm) => {
		await dependencies.resolveRunDirectory(arm.run);
		const args = armReplayArguments(arm, request.approval);
		assertRunsArmAInputs(
			arm,
			await replayConfig(
				args,
				benchmarkRunPaths(recordsDirectory(), arm.run).manifestFile,
			),
		);
		let groupRecordFile: string | undefined;
		await runReplayCommand(
			{
				args,
				json: false,
				stdinIsTerminal: request.stdinIsTerminal,
			},
			{
				...dependencies,
				output: {
					stdout: dependencies.output.stderr,
					stderr: dependencies.output.stderr,
				},
				execute: async (...execution) => {
					const outcome = await dependencies.execute(...execution);
					if (outcome.kind === "confirmation") {
						({ groupRecordFile } = outcome.evidence);
					}

					return outcome;
				},
			},
		);
		if (groupRecordFile === undefined) {
			throw new Error(
				`The ${ARM_LABELS[arm.role]} replay recorded no confirmation group`,
			);
		}

		return basename(dirname(groupRecordFile));
	};
}

/** How a command that runs arms was told their cost is approved. */
export interface ArmApprovalFlags {
	readonly yes: boolean;
	readonly approvedInBrowser: boolean;
}

export interface CompareAttemptsCommandRequest extends ArmApprovalFlags {
	readonly runsDirectory: string;
	readonly armA: string | undefined;
	readonly armB: string | undefined;
	readonly json: boolean;
	readonly stdinIsTerminal: boolean;
}

export function approvalMethod(request: ArmApprovalFlags): ApprovalMethod {
	if (request.approvedInBrowser) {
		if (!request.yes) {
			throw new UsageError("Use --approved-in-browser only with --yes");
		}

		return "browser";
	}

	return request.yes ? "yes" : "interactive";
}

/**
 * Compares two recorded attempts at one checkpoint as arms A and B, running
 * only the baseline arm, and prints the comparison's report.
 */
export async function runCompareAttemptsCommand(
	request: CompareAttemptsCommandRequest,
	dependencies: ReplayCommandDependencies,
): Promise<void> {
	const { armA, armB } = request;
	if (armA === undefined || armB === undefined) {
		throw new UsageError(
			"Provide both attempts' confirmation groups: rehearse compare attempts --arm-a <group-id> --arm-b <group-id>",
		);
	}

	const approval = approvalMethod(request);

	const { reportFile } = await compareAttempts(
		{ runsDirectory: request.runsDirectory, armA, armB },
		{
			runBaselineGroup: replayArmGroup(
				{ approval, stdinIsTerminal: request.stdinIsTerminal },
				dependencies,
			),
		},
	);

	await writeRecord(dependencies.output, reportFile, request.json);
}

export interface CompareExtendCommandRequest extends ArmApprovalFlags {
	readonly runsDirectory: string;
	readonly comparison: string | undefined;
	readonly attempts: string | undefined;
	readonly json: boolean;
	readonly stdinIsTerminal: boolean;
}

export interface CompareExtendCommandDependencies extends ReplayCommandDependencies {
	readonly prompt: (message: string) => Promise<string>;
}

const ATTEMPTS_PATTERN = /^[1-9][0-9]*$/u;
const COMPARISON_PATTERN = /^(?:comparison:)?(?<digest>[0-9a-f]{64})$/u;

/** A comparison as its report's directory or `list comparisons` names it. */
function parseComparison(comparison: string | undefined): string {
	const digest = COMPARISON_PATTERN.exec(comparison ?? "")?.groups?.["digest"];
	if (digest === undefined) {
		throw new UsageError(
			"Provide the comparison to extend by its manifest digest: rehearse compare extend --comparison <comparison:digest> --attempts <n>",
		);
	}

	return digest;
}

function parseAttemptsPerArm(attempts: string | undefined): number {
	if (attempts === undefined || !ATTEMPTS_PATTERN.test(attempts)) {
		throw new UsageError(
			"Provide how many attempts to add to each arm as a positive whole number: --attempts <n>",
		);
	}

	return Number(attempts);
}

export function formatExtensionCost(cost: ExtensionPlan["cost"]): string {
	return `Adding ${cost.attemptsPerArm} attempts to each arm costs about $${cost.usd.toFixed(2)}, at each arm's mean recorded cost per attempt.`;
}

/**
 * States what adding attempts to every arm of a saved comparison costs and,
 * once that is approved, replays them and prints the new comparison's report.
 * The operator approves the stated cost once, so each arm's replay runs as
 * approved and still meets the spend ceiling.
 */
export async function runCompareExtendCommand(
	request: CompareExtendCommandRequest,
	dependencies: CompareExtendCommandDependencies,
): Promise<void> {
	const comparison = parseComparison(request.comparison);
	const attemptsPerArm = parseAttemptsPerArm(request.attempts);
	const approval = approvalMethod(request);
	if (approval === "interactive") {
		requireInteractiveStdin(
			request.stdinIsTerminal,
			"approving the added attempts' cost needs a TTY; pass --yes instead",
		);
	}

	const { reportFile } = await extendComparison(
		{ runsDirectory: request.runsDirectory, comparison, attemptsPerArm },
		{
			approve: async (cost) => {
				dependencies.output.stderr(`${formatExtensionCost(cost)}\n`);
				if (approval !== "interactive") {
					return;
				}
				const response = await dependencies.prompt("Add the attempts? [y/N] ");
				const answer = response.trim().toLowerCase();
				if (answer !== "y" && answer !== "yes") {
					throw new Error("Extension declined");
				}
			},
			runArmGroup: replayArmGroup(
				{
					approval: approval === "interactive" ? "yes" : approval,
					stdinIsTerminal: request.stdinIsTerminal,
				},
				dependencies,
			),
		},
	);

	await writeRecord(dependencies.output, reportFile, request.json);
}
