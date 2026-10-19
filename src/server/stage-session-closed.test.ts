import { afterEach, describe, expect, it } from "bun:test";
import { join } from "node:path";

import { z } from "zod";

import { benchmarkRunPaths } from "#benchmark/run-layout";
import {
	CLOSED_STAGE_RECORD,
	RUN,
	clearStageSessionRoots,
	startedStage,
	transcriptOf,
} from "#server/stage-session-test-fixture";

import readStageSession from "./stage-session";

afterEach(clearStageSessionRoots);

async function verifyReadStageSessionNameOnceTheStageHasClosedAnswersTheSpansTheJudgeCitesFromTheTranscriptAndThePreservedTranscriptSPlace(): Promise<void> {
	const stage = await startedStage();
	const paths = benchmarkRunPaths(stage.runsDirectory, RUN);
	await Bun.write(
		join(paths.checkpointDirectory("build"), "transcript.jsonl"),
		transcriptOf([{ type: "user" }, { type: "assistant" }, { type: "user" }]),
	);
	await Bun.write(
		paths.stageFile("build"),
		JSON.stringify(CLOSED_STAGE_RECORD),
	);

	const session = await readStageSession({
		...stage,
		run: RUN,
		stage: "build",
	});

	expect(session).toEqual({
		lineCount: 3,
		spans: [
			{
				claim: "The agent asked before choosing a scope",
				exchange: 1,
				field: "message",
				index: 0,
				item: "HB-1",
				quote: "Which scope?",
				section: "hardBlockers",
			},
			{
				claim: "The owner chose the small scope",
				index: 1,
				item: "R1",
				quote: "Use the small scope",
				section: "requirements",
			},
		],
		state: "closed",
		transcriptPath: `.benchmark-runs/${RUN}.checkpoints/build/transcript.jsonl`,
	});
}

async function verifyReadStageSessionNameOnceTheStageHasClosedAnswersAClosedStageWithNoPreservedTranscriptAndNoGradeWithNeither(): Promise<void> {
	const stage = await startedStage();
	await Bun.write(
		benchmarkRunPaths(stage.runsDirectory, RUN).stageFile("build"),
		JSON.stringify({ error: "Run stopped", stage: "build" }),
	);

	const session = await readStageSession({
		...stage,
		run: RUN,
		stage: "build",
	});

	expect(session).toEqual({ spans: [], state: "closed" });
}

async function verifyReadStageSessionNameOnceTheStageHasClosedAnswersTheTranscriptAStoppedStageKeptBesideItsStopRecord(): Promise<void> {
	const stage = await startedStage();
	await Bun.write(
		join(
			benchmarkRunPaths(stage.runsDirectory, RUN).stoppedSessionDirectory(
				"build",
			),
			"transcript.jsonl",
		),
		transcriptOf([{ type: "user" }, { type: "assistant" }]),
	);
	await Bun.write(
		benchmarkRunPaths(stage.runsDirectory, RUN).stageFile("build"),
		JSON.stringify({
			dimensions: [],
			error: "Stage build graded D below the minimum C",
			grade: { grade: "D", verdict: "Below the bar" },
			hardBlockers: [],
			requirements: [],
			stage: "build",
			status: "STAGE_JUDGE_FAILED",
		}),
	);

	const session = await readStageSession({
		...stage,
		run: RUN,
		stage: "build",
	});

	expect(session).toEqual({
		lineCount: 2,
		spans: [],
		state: "closed",
		transcriptPath: `.benchmark-runs/${RUN}.build.session/transcript.jsonl`,
	});
}

async function verifyReadStageSessionNameOnceTheStageHasClosedFailsOnARecordWhoseGradeDoesNotHoldTheJudgedItems(): Promise<void> {
	const stage = await startedStage();
	await Bun.write(
		benchmarkRunPaths(stage.runsDirectory, RUN).stageFile("build"),
		JSON.stringify({ grade: { hardBlockers: "none" }, stage: "build" }),
	);

	const session = readStageSession({ ...stage, run: RUN, stage: "build" });

	expect(session).rejects.toThrow(z.ZodError);
}

async function verifyReadStageSessionNameOnceTheStageHasClosedAnswersTheSpansAStageJudgeCitesInTheRecordOfTheStageThatStoppedTheRun(): Promise<void> {
	const stage = await startedStage();
	await Bun.write(
		benchmarkRunPaths(stage.runsDirectory, RUN).stageFile("build"),
		JSON.stringify({
			dimensions: [],
			error: "Stage build graded D below the minimum C",
			grade: { grade: "D", verdict: "Below the bar" },
			hardBlockers: [
				{
					evidence: [
						{
							claim: "The agent chose a scope without asking",
							path: "transcript",
							source: "transcript",
						},
					],
					id: "HB-1",
					status: "FAIL",
				},
			],
			requirements: [],
			stage: "build",
			status: "STAGE_JUDGE_FAILED",
		}),
	);

	const session = await readStageSession({
		...stage,
		run: RUN,
		stage: "build",
	});

	expect(session).toEqual({
		spans: [
			{
				claim: "The agent chose a scope without asking",
				index: 0,
				item: "HB-1",
				section: "hardBlockers",
			},
		],
		state: "closed",
	});
}

describe(readStageSession.name, () => {
	describe("when the stage has closed", () => {
		it(
			"answers the spans the judge cites from the transcript and the preserved transcript's place",
			verifyReadStageSessionNameOnceTheStageHasClosedAnswersTheSpansTheJudgeCitesFromTheTranscriptAndThePreservedTranscriptSPlace,
		);

		it(
			"answers a closed stage with no preserved transcript and no grade with neither",
			verifyReadStageSessionNameOnceTheStageHasClosedAnswersAClosedStageWithNoPreservedTranscriptAndNoGradeWithNeither,
		);

		it(
			"answers the transcript a stopped stage kept beside its stop record",
			verifyReadStageSessionNameOnceTheStageHasClosedAnswersTheTranscriptAStoppedStageKeptBesideItsStopRecord,
		);

		it(
			"answers the spans a stage judge cites in the record of the stage that stopped the run",
			verifyReadStageSessionNameOnceTheStageHasClosedAnswersTheSpansAStageJudgeCitesInTheRecordOfTheStageThatStoppedTheRun,
		);
	});

	describe("when the saved grade has malformed judged items", () => {
		it(
			"fails on a record whose grade does not hold the judged items",
			verifyReadStageSessionNameOnceTheStageHasClosedFailsOnARecordWhoseGradeDoesNotHoldTheJudgedItems,
		);
	});
});
