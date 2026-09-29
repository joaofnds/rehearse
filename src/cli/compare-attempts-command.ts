import { basename, dirname } from "node:path";
import type { BaselineGroupRequest } from "#benchmark/compare-attempts";
import type { ApprovalMethod, ReplayCliConfig } from "#benchmark/config";
import { unhandled } from "#benchmark/contracts";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import type { ReplayCommandDependencies } from "#cli/replay-command";
import { runReplayCommand } from "#cli/replay-command";

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
 * was paid for, so the difference is refused before replay runs a rep.
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
 * Runs a comparison's baseline group through replay itself, so it meets the
 * same spend ceiling, model probe and cost approval as any replay. Replay's
 * record goes to stderr, since the comparison's report owns stdout.
 */
export function replayBaselineGroup(
	request: BaselineReplayRequest,
	dependencies: ReplayCommandDependencies,
): (baseline: BaselineGroupRequest) => Promise<string> {
	return async (baseline) => {
		let groupRecordFile: string | undefined;
		await runReplayCommand(
			{
				args: baselineReplayArguments(baseline, request.approval),
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
					assertRunsArmAInputs(baseline, execution[0]);
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
