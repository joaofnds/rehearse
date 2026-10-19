import { basename, dirname } from "node:path";

import type { ArmGroupRequest } from "#benchmark/compare-attempts";
import type { ComparisonArm } from "#benchmark/comparison-record";
import type { ApprovalMethod, ReplayCliConfig } from "#benchmark/config";
import { recordsDirectory } from "#benchmark/config";
import { unhandled } from "#benchmark/contracts";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { benchmarkRunPaths } from "#benchmark/run-layout";
import type { ReplayCommandDependencies } from "#cli/replay-command";
import { replayConfig, runReplayCommand } from "#cli/replay-command";

interface ReplayEvidence {
	groupRecordFile?: string | undefined;
}

interface ArmReplayRequest {
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
function replayArmGroup(
	request: ArmReplayRequest,
	dependencies: ReplayCommandDependencies,
): (arm: ArmGroupRequest) => Promise<string> {
	return async (arm) => {
		await dependencies.resolveRunDirectory(arm.run);
		const args = armReplayArguments(arm, request.approval);
		const paths = benchmarkRunPaths(recordsDirectory(), arm.run);
		const config = await replayConfig(args, paths.manifestFile);
		assertRunsArmAInputs(arm, config);
		const groupRecordFileCapture: ReplayEvidence = {};
		await runReplayCommand(
			{
				args,
				json: false,
				stdinIsTerminal: request.stdinIsTerminal,
			},
			{
				...dependencies,
				execute: async (...execution) => {
					const outcome = await dependencies.execute(...execution);
					if (outcome.kind === "confirmation") {
						groupRecordFileCapture.groupRecordFile =
							outcome.evidence.groupRecordFile;
					}

					return outcome;
				},
				output: {
					stderr: dependencies.output.stderr,
					stdout: dependencies.output.stderr,
				},
			},
		);
		if (groupRecordFileCapture.groupRecordFile === undefined) {
			throw new Error(
				`The ${ARM_LABELS[arm.role]} replay recorded no confirmation group`,
			);
		}

		return basename(dirname(groupRecordFileCapture.groupRecordFile));
	};
}

export { replayArmGroup as default };
export type { ArmReplayRequest };
