import { afterEach, describe, expect, it } from "bun:test";
import { join } from "node:path";

import { failureOf } from "#cli/cli-test-support";

import type { StageScorecard } from "./contracts";
import { runGradedStages } from "./run";
import {
	blockTranscriptDestination,
	noCalibration,
	providerProjectsDirectory,
	seedStageTranscript,
	testResources,
	unexpectedReports,
} from "./run-stage-context-test-fixture";
import { stageFixture } from "./run-stage-dependencies-test-fixture";
import type {
	StageJudgeExecution,
	StageJudgment,
} from "./run-stage-judge-test-fixtures";
import { StageQualityError } from "./stage-grade";

const RESOURCE_DRAIN_START_INDEX = 0;
testResources.registerCleanup();
afterEach(() => {
	expect(unexpectedReports.splice(RESOURCE_DRAIN_START_INDEX)).toEqual([]);
});

const expectedReportCount = 1;

const preservesCheckpointTranscript = async (): Promise<void> => {
	const { dependencies, context } = await stageFixture();
	// The fake stage reports sessionId "session"; seed the transcript the
	// provider would have written for it, under the target's own slug.
	const raw = `{"type":"user"}\n`;
	const { projectsDirectory } = await seedStageTranscript(context, raw);

	const outcome = await runGradedStages(dependencies, {
		...context,
		projectsDirectory,
	});

	const [first] = outcome.checkpoints;

	expect(first?.transcript).toEqual({
		file: "transcript.jsonl",
		sessionId: "session",
		status: "AVAILABLE",
	});
	const checkpointTranscript = await Bun.file(
		join(context.checkpointDirectory("shape"), "transcript.jsonl"),
	).text();
	expect(checkpointTranscript).toBe(raw);
};

const reportsTranscriptStorageFailure = async (): Promise<void> => {
	const { dependencies, scorecardFor, context } = await stageFixture();
	const { projectsDirectory } = await seedStageTranscript(
		context,
		`{"type":"user"}\n`,
	);
	const blocked = await blockTranscriptDestination(projectsDirectory);
	const stopping = {
		...dependencies,
		runStageJudge: async (
			_execution: StageJudgeExecution,
			{ input }: StageJudgment,
		) => await Promise.resolve(scorecardFor(input, "STOP")),
	};

	const reports: string[] = [];

	const failure = await failureOf(
		runGradedStages(stopping, {
			...context,
			calibrateStageFailure: noCalibration,
			projectsDirectory,
			reportError: (message) => {
				reports.push(message);
			},
			stoppedSessionDirectory: (stage: string) => join(blocked, stage),
		}),
	);

	const [observedFirstReport] = reports;

	expect(failure).toBeInstanceOf(StageQualityError);
	expect(reports).toHaveLength(expectedReportCount);
	expect(observedFirstReport).toMatch(
		/^Could not keep the shape stage's transcript beside its stop record: ENOTDIR/u,
	);
};

const recordsUnavailableTranscript = async (): Promise<void> => {
	const { dependencies, context } = await stageFixture();
	const projectsDirectory = await providerProjectsDirectory();

	const outcome = await runGradedStages(dependencies, {
		...context,
		projectsDirectory,
	});

	// No transcript was seeded. The checkpoint must say so rather than
	// leave a reader to treat the parsed exchanges as the raw record.
	const [observedFirstCheckpoint] = outcome.checkpoints;

	expect(observedFirstCheckpoint?.transcript).toEqual({
		sessionId: "session",
		status: "UNAVAILABLE",
	});
};
const STOPPED_TRANSCRIPT_JUDGMENTS = [
	[
		"its grade",
		async (scorecard: StageScorecard): Promise<StageScorecard> =>
			await Promise.resolve(scorecard),
	],
	[
		"its judge failing",
		async (): Promise<StageScorecard> =>
			await Promise.reject(new Error("the judge returned no valid grade")),
	],
] as const;
const preservesStoppedTranscript = async (
	_stoppedBy: string,
	judge: (scorecard: StageScorecard) => Promise<StageScorecard>,
): Promise<void> => {
	const { dependencies, scorecardFor, context } = await stageFixture();
	const raw = `{"type":"user"}\n{"type":"assistant"}\n`;
	const { projectsDirectory } = await seedStageTranscript(context, raw);
	const stopping = {
		...dependencies,
		runStageJudge: async (
			_execution: StageJudgeExecution,
			{ input }: StageJudgment,
		) => await judge(scorecardFor(input, "STOP")),
	};

	const stopped = runGradedStages(stopping, {
		...context,
		calibrateStageFailure: noCalibration,
		projectsDirectory,
	});

	expect(stopped).rejects.toBeInstanceOf(Error);
	await Promise.allSettled([stopped]);

	const stoppedTranscript = await Bun.file(
		join(context.stoppedSessionDirectory("shape"), "transcript.jsonl"),
	).text();
	expect(stoppedTranscript).toBe(raw);
};
describe("runGradedStages transcripts", () => {
	it(
		"preserves each stage's raw transcript into its checkpoint",
		preservesCheckpointTranscript,
	);

	it.each(STOPPED_TRANSCRIPT_JUDGMENTS)(
		"keeps the transcript of a stage stopped by %s beside its stop record",
		preservesStoppedTranscript,
	);

	it(
		"ends a graded stop below the minimum as one when its transcript cannot be kept",
		reportsTranscriptStorageFailure,
	);

	it(
		"records a stage whose provider wrote no transcript as unavailable",
		recordsUnavailableTranscript,
	);
});
