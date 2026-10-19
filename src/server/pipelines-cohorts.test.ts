import { afterEach, describe, expect, it } from "bun:test";

import { SHA256_HEX_DIGITS } from "#server/digest-test-support";
import {
	DECLARED_PIPELINE,
	OVERRIDE_PIPELINE,
	clearPipelineRoots,
	serving,
} from "#server/pipelines-workspace-test-fixture";

afterEach(clearPipelineRoots);

const OLDER_DIGEST = "a".repeat(SHA256_HEX_DIGITS);

const NEWER_DIGEST = "b".repeat(SHA256_HEX_DIGITS);

describe("GET /api/pipelines", () => {
	it(
		"counts only the runs at the latest corpus version and counts the runs it left out",
		verifyCountsOnlyTheRunsAtTheLatestCorpusVersion,
	);
	describe(
		"when a pipeline confirmation group ran the task",
		registerPipelinesCohortsWhenAPipelineConfirmationGroupRanTheTask,
	);
});

async function verifyCountsOnlyTheRunsAtTheLatestCorpusVersion(): Promise<void> {
	const { list, names } = await serving([
		{
			caseId: "pipe-case",
			pipelinePath: DECLARED_PIPELINE,
			stages: ["discuss", "build"],
			timestamp: "2026-09-01T10:00:00.000Z",
		},
		{
			caseId: "pipe-case",
			corpusDigest: OLDER_DIGEST,
			pipelinePath: DECLARED_PIPELINE,
			stages: ["discuss", "build"],
			timestamp: "2026-09-02T10:00:00.000Z",
		},
		{
			caseId: "pipe-case",
			corpusDigest: NEWER_DIGEST,
			pipelinePath: DECLARED_PIPELINE,
			stages: ["discuss", "build"],
			timestamp: "2026-09-03T10:00:00.000Z",
		},
		{
			caseId: "pipe-case",
			pipelinePath: DECLARED_PIPELINE,
			stages: ["discuss", "build"],
			timestamp: "2026-09-04T10:00:00.000Z",
		},
	]);

	const { pipelines } = await list();

	expect(pipelines).toMatchObject([
		{
			figures: { corpusVersion: NEWER_DIGEST, counted: 1, leftOut: 3 },
			runs: names.toReversed(),
		},
	]);
}

async function verifyCountsEachOfTheGroupSRepsAsA(): Promise<void> {
	const { list, names } = await serving(
		[
			{
				caseId: "pipe-case",
				corpusDigest: NEWER_DIGEST,
				pipelinePath: DECLARED_PIPELINE,
				stages: ["discuss", "build"],
				timestamp: "2026-09-01T10:00:00.000Z",
			},
		],
		[
			{
				caseId: "pipe-case",
				corpusDigest: NEWER_DIGEST,
				groupId: "group-a",
				pipelinePath: DECLARED_PIPELINE,
				reps: 3,
				stages: ["discuss", "build"],
			},
		],
	);

	const { pipelines } = await list();

	expect(pipelines).toMatchObject([
		{
			figures: { corpusVersion: NEWER_DIGEST, counted: 4, leftOut: 0 },
			runs: names,
		},
	]);
}

async function verifyListsAPipelineOnlyAGroupRanWithThe(): Promise<void> {
	const { list } = await serving(
		[],
		[
			{
				caseId: "pipe-case",
				groupId: "group-a",
				pipelinePath: OVERRIDE_PIPELINE,
				reps: 2,
				stages: ["build"],
			},
		],
	);

	const { pipelines } = await list();

	expect(pipelines).toMatchObject([
		{
			cases: ["pipe-case"],
			figures: { corpusVersion: null, counted: 2, leftOut: 0 },
			path: OVERRIDE_PIPELINE,
			runs: [],
			stages: ["build"],
		},
		{ path: DECLARED_PIPELINE },
	]);
}

async function verifyReadsTheTaskAsAGroupThatStartedAfter(): Promise<void> {
	const { list } = await serving(
		[
			{
				caseId: "pipe-case",
				corpusDigest: OLDER_DIGEST,
				pipelinePath: OVERRIDE_PIPELINE,
				stages: ["discuss", "build"],
				timestamp: "2026-09-01T10:15:00.000Z",
			},
		],
		[
			{
				caseId: "pipe-case",
				corpusDigest: NEWER_DIGEST,
				groupId: "group-a",
				pipelinePath: OVERRIDE_PIPELINE,
				reps: 2,
				stages: ["build"],
				startedAt: "2026-09-01T10:30:00.000Z",
			},
		],
	);

	const { pipelines } = await list();

	expect(pipelines).toMatchObject([
		{
			figures: { corpusVersion: NEWER_DIGEST, counted: 2, leftOut: 1 },
			path: OVERRIDE_PIPELINE,
			stages: ["build"],
		},
		{ path: DECLARED_PIPELINE },
	]);
}

async function verifyReadsTheTaskAsARunThatStartedAfter(): Promise<void> {
	const { list } = await serving(
		[
			{
				caseId: "pipe-case",
				corpusDigest: NEWER_DIGEST,
				pipelinePath: OVERRIDE_PIPELINE,
				stages: ["discuss", "build"],
				timestamp: "2026-09-01T10:30:00.000Z",
			},
		],
		[
			{
				caseId: "pipe-case",
				corpusDigest: OLDER_DIGEST,
				groupId: "group-a",
				pipelinePath: OVERRIDE_PIPELINE,
				reps: 2,
				stages: ["build"],
				startedAt: "2026-09-01T10:15:00.000Z",
			},
		],
	);

	const { pipelines } = await list();

	expect(pipelines).toMatchObject([
		{
			figures: { corpusVersion: NEWER_DIGEST, counted: 1, leftOut: 2 },
			path: OVERRIDE_PIPELINE,
			stages: ["discuss", "build"],
		},
		{ path: DECLARED_PIPELINE },
	]);
}

async function verifyReadsAPipelineOnlyGroupsRanAsItsNewest(): Promise<void> {
	const { list } = await serving(
		[],
		[
			{
				caseId: "pipe-case",
				corpusDigest: OLDER_DIGEST,
				groupId: "group-a",
				pipelinePath: OVERRIDE_PIPELINE,
				reps: 2,
				stages: ["discuss", "build"],
				startedAt: "2026-09-01T10:15:00.000Z",
			},
			{
				caseId: "pipe-case",
				corpusDigest: NEWER_DIGEST,
				groupId: "group-b",
				pipelinePath: OVERRIDE_PIPELINE,
				reps: 2,
				stages: ["build"],
				startedAt: "2026-09-01T10:30:00.000Z",
			},
		],
	);

	const { pipelines } = await list();

	expect(pipelines).toMatchObject([
		{
			figures: { corpusVersion: NEWER_DIGEST, counted: 2, leftOut: 2 },
			path: OVERRIDE_PIPELINE,
			stages: ["build"],
		},
		{ path: DECLARED_PIPELINE },
	]);
}

function registerPipelinesCohortsWhenAPipelineConfirmationGroupRanTheTask(): void {
	it(
		"counts each of the group's reps as a run at the version it froze",
		verifyCountsEachOfTheGroupSRepsAsA,
	);

	it(
		"lists a pipeline only a group ran with the stages the group declared",
		verifyListsAPipelineOnlyAGroupRanWithThe,
	);

	it(
		"reads the task as a group that started after its newest run ran it",
		verifyReadsTheTaskAsAGroupThatStartedAfter,
	);

	it(
		"reads the task as a run that started after its newest group within the hour ran it",
		verifyReadsTheTaskAsARunThatStartedAfter,
	);

	it(
		"reads a pipeline only groups ran as its newest group ran it, whatever their ids",
		verifyReadsAPipelineOnlyGroupsRanAsItsNewest,
	);
}
