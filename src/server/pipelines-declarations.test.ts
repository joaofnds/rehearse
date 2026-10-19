import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import {
	DECLARED_PIPELINE,
	OVERRIDE_PIPELINE,
	SESSION_CASE,
	clearPipelineRoots,
	serving,
} from "#server/pipelines-workspace-test-fixture";

afterEach(clearPipelineRoots);

const DECLARED_AND_OVERRIDE_RUNS = [
	{
		caseId: "pipe-case",
		pipelinePath: DECLARED_PIPELINE,
		stages: ["discuss", "build"],
		timestamp: "2026-09-01T10:00:00.000Z",
	},
	{
		caseId: "pipe-case",
		pipelinePath: OVERRIDE_PIPELINE,
		stages: ["build"],
		timestamp: "2026-09-02T10:00:00.000Z",
	},
];

describe("GET /api/pipelines", () => {
	it(
		"lists a case's own pipeline and a pipeline a run chose instead as two tasks",
		verifyListsACaseSOwnPipelineAndAPipeline,
	);
	it(
		"reads a declared pipeline no run recorded from its file",
		verifyReadsADeclaredPipelineNoRunRecordedFromIts,
	);
	it(
		"names every case that ran a task beside the case that declares it",
		verifyNamesEveryCaseThatRanATaskBesideThe,
	);
	it(
		"never lists a session case as a task",
		verifyNeverListsASessionCaseAsATask,
	);
	it(
		"reads a declared task's steps from its file, not from what its newest run ran",
		verifyReadsADeclaredTaskSStepsFromItsFile,
	);
});

async function verifyListsACaseSOwnPipelineAndAPipeline(): Promise<void> {
	const { get, names } = await serving(DECLARED_AND_OVERRIDE_RUNS);
	const [declaredRun, overrideRun] = names;

	const response = await get();

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(await response.json()).toEqual({
		pipelines: [
			{
				cases: ["pipe-case"],
				declaredBy: null,
				figures: { corpusVersion: null, counted: 1, leftOut: 0 },
				path: OVERRIDE_PIPELINE,
				runs: [overrideRun],
				stageJudges: 1,
				stages: ["build"],
				targets: ["/target"],
				taskJudges: 0,
			},
			{
				cases: ["pipe-case"],
				declaredBy: {
					id: "pipe-case",
					target: "/target",
					title: "A pipeline case",
				},
				figures: { corpusVersion: null, counted: 1, leftOut: 0 },
				path: DECLARED_PIPELINE,
				runs: [declaredRun],
				stageJudges: 2,
				stages: ["discuss", "build"],
				targets: ["/target"],
				taskJudges: 1,
			},
		],
		unreadable: [],
	});
}

async function verifyReadsADeclaredPipelineNoRunRecordedFromIts(): Promise<void> {
	const { list } = await serving([]);

	const { pipelines } = await list();

	expect(pipelines).toMatchObject([
		{
			cases: ["pipe-case"],
			figures: { corpusVersion: null, counted: 0, leftOut: 0 },
			path: DECLARED_PIPELINE,
			runs: [],
			stages: ["discuss", "build"],
		},
	]);
}

async function verifyNamesEveryCaseThatRanATaskBesideThe(): Promise<void> {
	const { list } = await serving([
		{
			caseId: "retired-case",
			pipelinePath: DECLARED_PIPELINE,
			stages: ["discuss", "build"],
			timestamp: "2026-09-01T10:00:00.000Z",
		},
	]);

	const { pipelines } = await list();

	expect(pipelines).toMatchObject([
		{ cases: ["pipe-case", "retired-case"], targets: ["/target"] },
	]);
}

async function verifyNeverListsASessionCaseAsATask(): Promise<void> {
	const { list } = await serving([
		{
			caseId: "pipe-case",
			pipelinePath: DECLARED_PIPELINE,
			stages: ["discuss", "build"],
			timestamp: "2026-09-01T10:00:00.000Z",
		},
	]);

	const { pipelines } = await list();

	expect(pipelines.map(({ path }) => path)).toEqual([DECLARED_PIPELINE]);
	expect(pipelines.flatMap(({ cases }) => cases)).not.toContain(
		SESSION_CASE.id,
	);
}

async function verifyReadsADeclaredTaskSStepsFromItsFile(): Promise<void> {
	const { list } = await serving([
		{
			caseId: "pipe-case",
			pipelinePath: DECLARED_PIPELINE,
			stages: ["discuss", "build"],
			timestamp: "2026-09-01T10:00:00.000Z",
		},
		{
			caseId: "pipe-case",
			pipelinePath: DECLARED_PIPELINE,
			stages: ["shape", "build", "review"],
			timestamp: "2026-09-02T10:00:00.000Z",
		},
	]);

	const { pipelines } = await list();

	expect(pipelines.map(({ stages }) => stages)).toEqual([["discuss", "build"]]);
}
