import { join } from "node:path";

import { writeRunManifest } from "#benchmark/manifest";
import type { JudgeProgress, NewRunEvent } from "#benchmark/run-events";
import { openRunEventStore } from "#benchmark/run-events";
import {
	benchmarkRunPaths,
	runEventsDatabaseFile,
} from "#benchmark/run-layout";
import { directorySource } from "#benchmark/run-records-test-support";
import { TEST_TARGET } from "#benchmark/test-support";
import ApiTestHarness from "#server/api-test-harness";
import { ApiTestWorkspace } from "#server/api-test-workspace";

import type { StageJudge } from "./stage-judge";

const JUDGED_ANSWER: StageJudge = {
	dimensions: [
		{
			evidence: [
				{
					claim: "Names the rule",
					path: "src/a.ts",
					place: "src/a.ts:3-4",
					quote: "const rule",
					source: "diff",
				},
			],
			grade: "B",
			id: "clarity",
		},
	],
	hardBlockers: [
		{
			evidence: [
				{
					claim: "The agent chose a scope without asking",
					path: "transcript",
					place: "exchange 3 message, characters 0-25",
					quote: "I'll take the small scope",
					source: "transcript",
				},
			],
			id: "HB-1",
			status: "FAIL",
		},
	],
	state: "judged",
};

const RESOURCE_DRAIN_START_INDEX = 0;

const RUN = "2026-10-01T10-00-00.000Z";

const workspaces: ApiTestWorkspace[] = [];

async function queuedRun(): Promise<string> {
	const workspace = new ApiTestWorkspace();
	workspaces.push(workspace);
	const root = await workspace.emptyDirectory("rehearse-stage-judge-");
	const runsDirectory = join(root, ".benchmark-runs");
	await writeRunManifest(benchmarkRunPaths(runsDirectory, RUN).manifestFile, {
		caseId: "audit-log",
		controlSha: "control-sha",
		judgeModel: "opus",
		model: "sonnet",
		pipeline: {
			stages: [
				{
					kind: "delivery",
					name: "build",
					rubric: "rubrics/build.json",
					skill: "build",
				},
			],
			statuses: ["To Do", "Done"],
			target: TEST_TARGET,
		},
		pipelinePath: "pipelines/default.json",
		productBrief: "Brief text",
		sessionBudgetUsd: 5,
		sourceRoot: join(root, "source"),
		sourceSha: "source-sha",
		task: "Task text",
		taskId: "TASK-1",
		taskSha: "task-sha",
		timestamp: "2026-10-01T10:00:00.000Z",
	});

	return runsDirectory;
}

async function recordEvents(
	runsDirectory: string,
	events: readonly NewRunEvent[],
): Promise<void> {
	const store = await openRunEventStore(runEventsDatabaseFile(runsDirectory));
	for (const event of events) {
		store.append(event);
	}
	store.close();
}

const systems: ApiTestHarness[] = [];

async function startStageJudgeApi(
	runsDirectory: string,
): Promise<ApiTestHarness["driver"]> {
	const system = await ApiTestHarness.setup({
		projectsDirectory: join(runsDirectory, "..", "projects"),
		runsDirectory,
		source: directorySource(runsDirectory),
	});
	systems.push(system);

	return system.driver;
}

const JUDGED_ITEMS = {
	dimensions: [
		{
			evidence: [
				{
					claim: "Names the rule",
					locator: {
						endLine: 4,
						file: "src/a.ts",
						kind: "lines",
						occurrences: 1,
						startLine: 3,
					},
					path: "src/a.ts",
					quote: "const rule",
					source: "diff",
				},
			],
			grade: "B",
			id: "clarity",
		},
	],
	hardBlockers: [
		{
			evidence: [
				{
					claim: "The agent chose a scope without asking",
					locator: {
						end: 25,
						exchange: 2,
						field: "message",
						kind: "exchange",
						start: 0,
					},
					path: "transcript",
					quote: "I'll take the small scope",
					source: "transcript",
				},
			],
			id: "HB-1",
			status: "FAIL",
		},
	],
	requirements: [
		{
			evidence: [{ claim: "Holds it", path: "a.md", source: "artifact" }],
			id: "R1",
			status: "PASS",
		},
	],
};

const NOTHING_RETURNED = {
	attempt: 1,
	sections: {
		dimensions: { returned: 0, total: 1 },
		hardBlockers: { returned: 0, total: 2 },
		requirements: { returned: 0, total: 1 },
	},
	state: "returning",
} satisfies JudgeProgress;

async function clearJudgeRoots(): Promise<void> {
	await Promise.all(
		systems.splice(RESOURCE_DRAIN_START_INDEX).map(async (system) => {
			await system.teardown();
		}),
	);
	await Promise.all(
		workspaces.splice(RESOURCE_DRAIN_START_INDEX).map(async (workspace) => {
			await workspace.dispose();
		}),
	);
}

export {
	JUDGED_ANSWER,
	RUN,
	queuedRun,
	recordEvents,
	startStageJudgeApi,
	JUDGED_ITEMS,
	NOTHING_RETURNED,
	clearJudgeRoots,
};
