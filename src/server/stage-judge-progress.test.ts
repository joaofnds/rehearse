import { afterEach, describe, expect, it } from "bun:test";

import type { JudgeProgress } from "#benchmark/run-events";
import { benchmarkRunPaths } from "#benchmark/run-layout";
import StageJudgeEventBuilder from "#server/stage-judge-event-test-builder";
import {
	NOTHING_RETURNED,
	RUN,
	clearJudgeRoots,
	queuedRun,
	recordEvents,
} from "#server/stage-judge-test-fixture";

import readStageJudge from "./stage-judge";

afterEach(clearJudgeRoots);

describe(readStageJudge.name, () => {
	describe("when judging progress is recorded in the event stream", () => {
		it(
			"answers a judge still returning with its latest progress and what it has been charged so far",
			verifyReturningJudge,
		);

		it(
			"answers from the stage's own events, whatever another stage's judge has recorded",
			verifyStageScopedProgress,
		);

		it(
			"answers from the stage's latest judging when it was judged again",
			verifyLatestJudging,
		);

		it(
			"answers a stage whose record awaits its judge from the stream",
			verifyAwaitingJudgeEvents,
		);

		it(
			"answers progress recorded before per-item results as its counts alone",
			verifyLegacyProgressCounts,
		);

		it(
			"answers no progress between a rejected attempt and the next one's first reading",
			verifyRejectedAttemptReset,
		);
	});
});

async function verifyReturningJudge(): Promise<void> {
	const runsDirectory = await queuedRun();
	const latest: JudgeProgress = {
		attempt: 2,
		items: {
			dimensions: [{ id: "clarity" }],
			hardBlockers: [{ id: "HB-1", status: "FAIL" }, { id: "HB-2" }],
		},
		sections: {
			dimensions: { returned: 0, total: 1 },
			hardBlockers: { returned: 1, total: 2 },
			requirements: { returned: 0, total: 1 },
		},
		state: "returning",
	};
	await recordEvents(runsDirectory, [
		new StageJudgeEventBuilder({ runSpentUsd: 1 }).build(),
		new StageJudgeEventBuilder({
			kind: "stage-judging",
			runSpentUsd: 2,
		}).build(),
		new StageJudgeEventBuilder({
			judge: NOTHING_RETURNED,
			kind: "judge-progress",
			runSpentUsd: 2,
		}).build(),
		new StageJudgeEventBuilder({
			judge: { attempt: 1, reason: "Bad quote", state: "rejected" },
			kind: "judge-progress",
			runSpentUsd: 2.5,
		}).build(),
		new StageJudgeEventBuilder({
			judge: latest,
			kind: "judge-progress",
			runSpentUsd: 2.5,
		}).build(),
	]);

	const judge = await readStageJudge({
		run: RUN,
		runsDirectory,
		stage: "build",
	});

	expect(judge).toEqual({
		progress: latest,
		spentUsd: 0.5,
		state: "returning",
	});
}

async function verifyStageScopedProgress(): Promise<void> {
	const runsDirectory = await queuedRun();
	await recordEvents(runsDirectory, [
		{
			...new StageJudgeEventBuilder({
				kind: "stage-judging",
				runSpentUsd: 1,
			}).build(),
			stage: "plan",
		},
		{
			...new StageJudgeEventBuilder({
				judge: NOTHING_RETURNED,
				kind: "judge-progress",
				runSpentUsd: 1,
			}).build(),
			stage: "plan",
		},
		new StageJudgeEventBuilder({
			kind: "stage-started",
			runSpentUsd: 2,
		}).build(),
	]);

	const judge = await readStageJudge({
		run: RUN,
		runsDirectory,
		stage: "build",
	});

	expect(judge).toEqual({ state: "waiting" });
}

async function verifyLatestJudging(): Promise<void> {
	const runsDirectory = await queuedRun();
	await recordEvents(runsDirectory, [
		new StageJudgeEventBuilder({
			kind: "stage-judging",
			runSpentUsd: 1,
		}).build(),
		new StageJudgeEventBuilder({
			judge: NOTHING_RETURNED,
			kind: "judge-progress",
			runSpentUsd: 1.5,
		}).build(),
		new StageJudgeEventBuilder({
			kind: "stage-judging",
			runSpentUsd: 3,
		}).build(),
		new StageJudgeEventBuilder({
			judge: NOTHING_RETURNED,
			kind: "judge-progress",
			runSpentUsd: 3.25,
		}).build(),
	]);

	const judge = await readStageJudge({
		run: RUN,
		runsDirectory,
		stage: "build",
	});

	expect(judge).toEqual({
		progress: NOTHING_RETURNED,
		spentUsd: 0.25,
		state: "returning",
	});
}

async function verifyAwaitingJudgeEvents(): Promise<void> {
	const runsDirectory = await queuedRun();
	await recordEvents(runsDirectory, [
		new StageJudgeEventBuilder({
			kind: "stage-judging",
			runSpentUsd: 2,
		}).build(),
		new StageJudgeEventBuilder({
			judge: NOTHING_RETURNED,
			kind: "judge-progress",
			runSpentUsd: 2,
		}).build(),
	]);
	await Bun.write(
		benchmarkRunPaths(runsDirectory, RUN).stageFile("build"),
		JSON.stringify({ stage: "build", status: "AWAITING_STAGE_JUDGE" }),
	);

	const judge = await readStageJudge({
		run: RUN,
		runsDirectory,
		stage: "build",
	});

	expect(judge).toEqual({
		progress: NOTHING_RETURNED,
		spentUsd: 0,
		state: "returning",
	});
}

async function verifyLegacyProgressCounts(): Promise<void> {
	const runsDirectory = await queuedRun();
	await recordEvents(runsDirectory, [
		new StageJudgeEventBuilder({ kind: "stage-judging" }).build(),
		new StageJudgeEventBuilder({
			judge: NOTHING_RETURNED,
			kind: "judge-progress",
		}).build(),
	]);

	const judge = await readStageJudge({
		run: RUN,
		runsDirectory,
		stage: "build",
	});

	expect(judge).toEqual({ progress: NOTHING_RETURNED, state: "returning" });
}

async function verifyRejectedAttemptReset(): Promise<void> {
	const runsDirectory = await queuedRun();
	await recordEvents(runsDirectory, [
		new StageJudgeEventBuilder({
			kind: "stage-judging",
			runSpentUsd: 2,
		}).build(),
		new StageJudgeEventBuilder({
			judge: NOTHING_RETURNED,
			kind: "judge-progress",
			runSpentUsd: 2,
		}).build(),
		new StageJudgeEventBuilder({
			judge: { attempt: 1, reason: "Bad quote", state: "rejected" },
			kind: "judge-progress",
			runSpentUsd: 2.25,
		}).build(),
	]);

	const judge = await readStageJudge({
		run: RUN,
		runsDirectory,
		stage: "build",
	});

	expect(judge).toEqual({ spentUsd: 0.25, state: "returning" });
}
