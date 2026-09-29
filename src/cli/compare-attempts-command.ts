import { createHash } from "node:crypto";
import { basename, dirname } from "node:path";
import type { BaselineGroupRequest } from "#benchmark/compare-attempts";
import { compareAttempts } from "#benchmark/compare-attempts";
import type { ApprovalMethod, ReplayCliConfig } from "#benchmark/config";
import { recordsDirectory } from "#benchmark/config";
import { unhandled } from "#benchmark/contracts";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { loadRunManifest } from "#benchmark/manifest";
import { benchmarkRunPaths } from "#benchmark/run-layout";
import { loadStageRubric } from "#benchmark/stage-grading";
import { UsageError } from "#cli/commands";
import { writeRecord } from "#cli/output";
import type { ReplayCommandDependencies } from "#cli/replay-command";
import { replayConfig, runReplayCommand } from "#cli/replay-command";

export interface BaselineReplayRequest {
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

function baselineReplayArguments(
	baseline: Readonly<BaselineGroupRequest>,
	approval: ApprovalMethod,
): string[] {
	return [
		"--run",
		baseline.run,
		"--stage",
		baseline.stage,
		"--corpus",
		baseline.corpusDirectory,
		"--model",
		baseline.model,
		...(baseline.effort === undefined ? [] : ["--effort", baseline.effort]),
		"--judge-model",
		baseline.judgeModel,
		...(baseline.judgeEffort === undefined
			? []
			: ["--judge-effort", baseline.judgeEffort]),
		"--session-budget-usd",
		String(baseline.sessionBudgetUsd),
		"--confirm",
		"--reps",
		String(baseline.reps),
		"--without-stage-skill",
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

/**
 * Replay fills a knob its flags leave out from the environment, and a Judge
 * effort from the worker's, so a baseline replay can resolve to inputs arm A
 * never ran. Its group would then be refused by the comparison only after it
 * was paid for, so the difference is refused before replay probes the model.
 */
function assertRunsArmAInputs(
	baseline: Readonly<BaselineGroupRequest>,
	config: Readonly<ReplayCliConfig>,
): void {
	for (const knob of CONTROLLED_KNOBS) {
		if (config[knob] !== baseline[knob]) {
			throw new RefusedPreconditionError(
				`the baseline replay would run ${knob} ${String(config[knob])} where arm A recorded ${String(baseline[knob] ?? "none")}, so its group could not be compared`,
			);
		}
	}
}

/**
 * Replay grades the baseline on the stage's rubric as it stands now, so a
 * rubric edited since arm A was recorded would have its group refused by the
 * comparison only after it was paid for. The run's manifest names the rubric
 * replay will load, so the edit is refused before replay starts. The same
 * pipeline names the stage's own skill, the only one replay can remove.
 */
async function assertGradesOnArmARubric(
	baseline: Readonly<BaselineGroupRequest>,
): Promise<void> {
	const manifest = await loadRunManifest(
		benchmarkRunPaths(recordsDirectory(), baseline.run).manifestFile,
	);
	const stage = manifest.pipeline.stages.find(
		({ name }) => name === baseline.stage,
	);
	if (stage === undefined) {
		throw new RefusedPreconditionError(
			`the ${baseline.run} run's pipeline has no ${baseline.stage} stage, so no rubric can grade a baseline group against arm A`,
		);
	}
	if (baseline.skillUnderTest !== `skills/${stage.skill}/`) {
		throw new RefusedPreconditionError(
			`${baseline.skillUnderTest} is not the ${stage.name} stage's own skill, which is the only skill a baseline replay can run without`,
		);
	}

	let content: string;
	try {
		({ content } = await loadStageRubric(stage));
	} catch (error) {
		throw new RefusedPreconditionError(
			`the ${stage.rubric} rubric cannot be read, so a baseline group run now could not be compared with arm A: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	if (
		createHash("sha256").update(content).digest("hex") !== baseline.rubricSha256
	) {
		throw new RefusedPreconditionError(
			`the ${stage.rubric} rubric changed since arm A was recorded, so a baseline group run now could not be compared with it`,
		);
	}
}

/**
 * Runs a comparison's baseline group through replay itself, so it meets the
 * same spend ceiling, model probe and cost approval as any replay. Replay's
 * record goes to stderr, since the comparison's report owns stdout.
 */
export function replayBaselineGroup(
	request: BaselineReplayRequest,
	dependencies: ReplayCommandDependencies,
): (baseline: BaselineGroupRequest) => Promise<string> {
	return async (baseline) => {
		await dependencies.resolveRunDirectory(baseline.run);
		await assertGradesOnArmARubric(baseline);
		const args = baselineReplayArguments(baseline, request.approval);
		assertRunsArmAInputs(
			baseline,
			await replayConfig(
				args,
				benchmarkRunPaths(recordsDirectory(), baseline.run).manifestFile,
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
			throw new Error("The baseline replay recorded no confirmation group");
		}

		return basename(dirname(groupRecordFile));
	};
}

export interface CompareAttemptsCommandRequest {
	readonly runsDirectory: string;
	readonly armA: string | undefined;
	readonly armB: string | undefined;
	readonly yes: boolean;
	readonly approvedInBrowser: boolean;
	readonly json: boolean;
	readonly stdinIsTerminal: boolean;
}

function approvalMethod(
	request: Readonly<CompareAttemptsCommandRequest>,
): ApprovalMethod {
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
			runBaselineGroup: replayBaselineGroup(
				{ approval, stdinIsTerminal: request.stdinIsTerminal },
				dependencies,
			),
		},
	);

	await writeRecord(dependencies.output, reportFile, request.json);
}
