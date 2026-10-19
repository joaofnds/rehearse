import { afterEach, describe, expect, it } from "bun:test";

import { z } from "zod";

import type { ListedRow } from "#server/history-figures-workspace-test-fixture";
import {
	clearFigureRoots,
	emptyFixture,
	onlyRowOfKind,
} from "#server/history-figures-workspace-test-fixture";

import {
	NO_GRADED_BLOCKERS_REASON,
	REPLAY_FINAL_OUTCOME_REASON,
	REPLAY_WALL_TIME_REASON,
	SOURCE_MANIFEST_REASON,
	UNLISTED_STAGE_REASON,
} from "./run-history";

afterEach(clearFigureRoots);

/** A replay record, read loosely so a test can rename the stage it replayed. */
const replayStageSchema = z.looseObject({ stage: z.string() });

/** A replay record, read loosely so a test can add to its stage grade. */
const replayGradeSchema = z.looseObject({
	scorecard: z.looseObject({ grade: z.looseObject({}) }),
});

interface ReplayRowFixtureInput {
	readonly elapsedMs?: number | undefined;
}

async function replayRow({
	elapsedMs,
}: ReplayRowFixtureInput): Promise<ListedRow | undefined> {
	const fixture = await emptyFixture();
	await fixture.sessions.writeReplayOf({
		elapsedMs,
		run: fixture.replayableRun,
		timestamp: fixture.stageAttempt.timestamp,
	});

	return await onlyRowOfKind(fixture, "replay");
}

describe("/api/runs", () => {
	describe("GET", () => {
		describe("a replay row", () => {
			it(
				"carries its stage's grade and its cost summed over its session, Product Owner and judge",
				verifyCarriesItsStageSGradeAndItsCostSummed,
			);

			it(
				"carries a final outcome of not applicable with its reason",
				verifyCarriesAFinalOutcomeOfNotApplicableWithIts,
			);

			it(
				"carries its source pipeline's stages in order",
				verifyCarriesItsSourcePipelineSStagesInOrder,
			);

			it(
				"carries its source pipeline's stages as unavailable when the source run's manifest is gone",
				verifyCarriesItsSourcePipelineSStagesAsUnavailableWhen,
			);

			it(
				"carries its source pipeline's stages as unavailable when they do not list the stage it replayed",
				verifyCarriesItsSourcePipelineSStagesAsUnavailableWhenThey,
			);

			it(
				"carries the elapsed time its record keeps as its wall time",
				verifyCarriesTheElapsedTimeItsRecordKeepsAsIts,
			);

			it(
				"carries its wall time as not recorded with its reason",
				verifyCarriesItsWallTimeAsNotRecordedWithIts,
			);

			it(
				"carries the ids of the hard blockers its stage judge found fired",
				verifyCarriesTheIdsOfTheHardBlockersItsStage,
			);

			it(
				"carries its fired blockers as not recorded when its grade holds none",
				verifyCarriesItsFiredBlockersAsNotRecordedWhenIts,
			);
		});
	});
});

async function verifyCarriesItsStageSGradeAndItsCostSummed(): Promise<void> {
	const row = await replayRow({});

	expect(row).toMatchObject({
		cost: {
			missing: [],
			parts: [
				{ part: "build session", usd: 1 },
				{ part: "Product Owner", usd: 0.25 },
				{ part: "build judge", usd: 0.5 },
			],
			state: "available",
			usd: 1.75,
		},
		grade: "A",
	});
}

async function verifyCarriesAFinalOutcomeOfNotApplicableWithIts(): Promise<void> {
	const row = await replayRow({});

	expect(row).toMatchObject({
		finalOutcome: {
			reason: REPLAY_FINAL_OUTCOME_REASON,
			state: "available",
			status: "NOT_APPLICABLE",
		},
	});
}

async function verifyCarriesItsSourcePipelineSStagesInOrder(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.pipeline.writePipelineRun({
		caseId: "audit-log",
		run: fixture.replayableRun,
	});
	await fixture.sessions.writeReplayOf({
		run: fixture.replayableRun,
		timestamp: fixture.stageAttempt.timestamp,
	});

	const row = await onlyRowOfKind(fixture, "replay");

	expect(row).toMatchObject({
		pipelineStages: { stages: ["discuss", "build"], state: "available" },
	});
}

async function verifyCarriesItsSourcePipelineSStagesAsUnavailableWhen(): Promise<void> {
	const row = await replayRow({});

	expect(row).toMatchObject({
		pipelineStages: {
			reasons: [SOURCE_MANIFEST_REASON],
			state: "unavailable",
		},
	});
}

async function verifyCarriesItsSourcePipelineSStagesAsUnavailableWhenThey(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.pipeline.writePipelineRun({
		caseId: "audit-log",
		run: fixture.replayableRun,
	});
	await fixture.sessions.writeReplayOf({
		run: fixture.replayableRun,
		timestamp: fixture.stageAttempt.timestamp,
	});
	const file = Bun.file(fixture.stageAttemptFile);
	const record = replayStageSchema.parse(await file.json());
	await Bun.write(file, JSON.stringify({ ...record, stage: "review" }));

	const row = await onlyRowOfKind(fixture, "replay");

	expect(row).toMatchObject({
		pipelineStages: {
			reasons: [UNLISTED_STAGE_REASON],
			state: "unavailable",
		},
	});
}

async function verifyCarriesTheElapsedTimeItsRecordKeepsAsIts(): Promise<void> {
	const row = await replayRow({ elapsedMs: 3000 });

	expect(row).toMatchObject({
		wallTime: { ms: 3000, state: "available" },
	});
}

async function verifyCarriesItsWallTimeAsNotRecordedWithIts(): Promise<void> {
	const row = await replayRow({});

	expect(row).toMatchObject({
		wallTime: {
			reasons: [REPLAY_WALL_TIME_REASON],
			state: "unavailable",
		},
	});
}

async function verifyCarriesTheIdsOfTheHardBlockersItsStage(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.sessions.writeReplayOf({
		run: fixture.replayableRun,
		timestamp: fixture.stageAttempt.timestamp,
	});
	const file = Bun.file(fixture.stageAttemptFile);
	const record = replayGradeSchema.parse(await file.json());
	await Bun.write(
		file,
		JSON.stringify({
			...record,
			scorecard: {
				...record.scorecard,
				grade: {
					...record.scorecard.grade,
					hardBlockers: [
						{ id: "invalid-stage-delivery", status: "FAIL" },
						{ id: "invented-scope", status: "PASS" },
					],
				},
			},
		}),
	);

	const row = await onlyRowOfKind(fixture, "replay");

	expect(row).toMatchObject({
		firedBlockers: {
			ids: ["invalid-stage-delivery"],
			state: "available",
		},
	});
}

async function verifyCarriesItsFiredBlockersAsNotRecordedWhenIts(): Promise<void> {
	const row = await replayRow({});

	expect(row).toMatchObject({
		firedBlockers: {
			reasons: [NO_GRADED_BLOCKERS_REASON],
			state: "unavailable",
		},
	});
}
