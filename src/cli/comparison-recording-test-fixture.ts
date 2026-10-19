import { basename, dirname } from "node:path";

import { compareAttempts } from "#benchmark/compare-attempts";
import type { ArmGroupRequest } from "#benchmark/compare-attempts";
import { RUN, RecordedArms } from "#benchmark/compare-attempts-test-support";
import { COMPARISON_ARMS } from "#benchmark/comparison-record";
import type { ComparisonArm } from "#benchmark/comparison-record";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import type { CliTestWorkspace } from "#cli/cli-test-support";
import type { ReplayCommandDependencies } from "#cli/replay-command";
import writeReplayableRunManifest from "#cli/replay-test-support";

import { ComparisonReplayAdapter } from "./comparison-replay-test-adapter";

const NO_CONFIRMATION_REPS = 0;

interface RecordedComparisonArms {
	readonly arms: RecordedArms;
	readonly armA: string;
	readonly armB: string;
}

async function recordedComparisonArms(
	workspace: Readonly<Pick<CliTestWorkspace, "createDirectory">>,
): Promise<RecordedComparisonArms> {
	const arms = await RecordedArms.create(
		await workspace.createDirectory("rehearse-compare-command-runs-"),
		await workspace.createDirectory("rehearse-compare-command-scratch-"),
	);
	const armA = await arms.recordArm("baseline", {
		"CLAUDE.md": "global instructions\n",
		"skills/build/SKILL.md": "build\n",
	});
	const armB = await arms.recordArm("candidate", {
		"CLAUDE.md": "global instructions\n",
		"skills/build/SKILL.md": "revised build\n",
	});

	await Array.fromAsync([armA, armB], async (arm) => {
		await arms.readInStage(arm, "skills/build/SKILL.md");
	});

	return { armA, armB, arms };
}

interface GroupRecording {
	readonly runsDirectory: string;
	readonly roles: readonly ComparisonArm[];
	readonly runGroup: (request: ArmGroupRequest) => Promise<string>;
}

function recordedGroupExecution({
	runGroup,
	runsDirectory,
	roles,
}: GroupRecording): ReplayCommandDependencies["execute"] {
	const remainingRoles = [...roles];

	return async ({ config }) => {
		const role = remainingRoles.shift();
		if (role === undefined) {
			throw new Error("Expected one replay per arm");
		}

		const groupId = await runGroup({
			corpusDirectory: config.corpus ?? "",
			effort: config.effort,
			judgeEffort: config.judgeEffort,
			judgeModel: config.judgeModel,
			model: config.model,
			reps: config.confirmation?.reps ?? NO_CONFIRMATION_REPS,
			role,
			run: config.runName,
			sessionBudgetUsd: config.sessionBudgetUsd,
			stage: config.stage,
			withoutStageSkill: config.stageSkill === "absent",
		});

		return {
			evidence: {
				groupRecordFile: confirmationGroupPaths(runsDirectory, groupId)
					.groupFile,
				repRecordFiles: [],
				reportFile: "/unused/report.json",
			},
			kind: "confirmation" as const,
		};
	};
}

interface ComparisonWorkspace {
	readonly createDirectory: (prefix: string) => Promise<string>;
	readonly track: (...paths: readonly string[]) => void;
}

interface SavedComparison {
	readonly arms: RecordedArms;
	readonly comparison: string;
	readonly replay: ComparisonReplayAdapter;
}

async function savedComparison(
	workspace: ComparisonWorkspace,
): Promise<SavedComparison> {
	workspace.track(await writeReplayableRunManifest(RUN));
	const { arms, armA, armB } = await recordedComparisonArms(workspace);
	const { reportFile } = await compareAttempts(
		{ armA, armB, runsDirectory: arms.runsDirectory },
		{ runBaselineGroup: arms.runBaselineGroup },
	);
	const replay = new ComparisonReplayAdapter({
		execute: recordedGroupExecution({
			roles: COMPARISON_ARMS,
			runGroup: arms.runMoreGroup,
			runsDirectory: arms.runsDirectory,
		}),
		run: RUN,
	});

	return { arms, comparison: basename(dirname(reportFile)), replay };
}

export { recordedComparisonArms, recordedGroupExecution, savedComparison };
export { RUN } from "#benchmark/compare-attempts-test-support";
