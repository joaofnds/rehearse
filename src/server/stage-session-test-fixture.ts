import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeRunManifest } from "#benchmark/manifest";
import { openRunEventStore } from "#benchmark/run-events";
import {
	benchmarkRunPaths,
	runEventsDatabaseFile,
} from "#benchmark/run-layout";
import { directorySource } from "#benchmark/run-records-test-support";
import { projectSlug } from "#benchmark/session-capture";
import { TEST_TARGET } from "#benchmark/test-support";
import ApiTestHarness from "#server/api-test-harness";

const RESOURCE_DRAIN_START_INDEX = 0;

const systems: ApiTestHarness[] = [];

async function startStageSessionApi(
	stage: StartedStage,
): Promise<ApiTestHarness["driver"]> {
	const system = await ApiTestHarness.setup({
		projectsDirectory: stage.projectsDirectory,
		runsDirectory: stage.runsDirectory,
		source: directorySource(stage.runsDirectory),
	});
	systems.push(system);

	return system.driver;
}

const RUN = "2026-10-01T10-00-00.000Z";

const SESSION_ID = "0b7e8d0c-2f4c-4a54-9a3e-6f1d2c3b4a59";

const roots: string[] = [];

interface StartedStage {
	readonly runsDirectory: string;
	readonly projectsDirectory: string;
	readonly transcriptFile: string;
}

async function queuedStage(
	sessionId: string = SESSION_ID,
): Promise<StartedStage> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-stage-session-"));
	roots.push(root);
	const runsDirectory = join(root, ".benchmark-runs");
	const projectsDirectory = join(root, "projects");
	const sourceRoot = join(root, "source");
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
		sourceRoot,
		sourceSha: "source-sha",
		task: "Task text",
		taskId: "TASK-1",
		taskSha: "task-sha",
		timestamp: "2026-10-01T10:00:00.000Z",
	});
	const projectDirectory = join(projectsDirectory, projectSlug(sourceRoot));
	await mkdir(projectDirectory, { recursive: true });

	return {
		projectsDirectory,
		runsDirectory,
		transcriptFile: join(projectDirectory, `${sessionId}.jsonl`),
	};
}

async function recordStart(
	runsDirectory: string,
	sessionId?: string,
): Promise<void> {
	const store = await openRunEventStore(runEventsDatabaseFile(runsDirectory));
	store.append({
		elapsedMs: 0,
		kind: "stage-started",
		runId: RUN,
		sessionId,
		spentUsd: 0,
		stage: "build",
	});
	store.close();
}

async function startedStage(
	sessionId: string = SESSION_ID,
): Promise<StartedStage> {
	const stage = await queuedStage(sessionId);
	await recordStart(stage.runsDirectory, sessionId);

	return stage;
}

function transcriptOf(records: readonly unknown[]): string {
	return records.map((record) => `${JSON.stringify(record)}\n`).join("");
}

function toolResultTranscript(content: string): string {
	return transcriptOf([
		{
			message: {
				content: [{ content, tool_use_id: "t1", type: "tool_result" }],
			},
			type: "user",
		},
	]);
}

async function clearStageSessionRoots(): Promise<void> {
	await Promise.all(
		systems.splice(RESOURCE_DRAIN_START_INDEX).map(async (system) => {
			await system.teardown();
		}),
	);
	await Promise.all(
		roots.splice(RESOURCE_DRAIN_START_INDEX).map(async (root) => {
			await rm(root, { force: true, recursive: true });
		}),
	);
}

const RUNNING_TRANSCRIPT = [
	{
		message: { content: "Work TASK-1 with the build skill" },
		type: "user",
	},
	{
		message: { content: [{ text: "Reading the card.", type: "text" }] },
		type: "assistant",
	},
	{
		message: {
			content: [
				{
					id: "t1",
					input: { file_path: "src/auth/session.ts" },
					name: "Read",
					type: "tool_use",
				},
			],
		},
		type: "assistant",
	},
	{
		message: {
			content: [
				{
					content: "export function session() {}\nthe rest",
					tool_use_id: "t1",
					type: "tool_result",
				},
			],
		},
		type: "user",
	},
	{
		message: {
			content: [
				{
					id: "t2",
					input: { command: "bun test" },
					name: "Bash",
					type: "tool_use",
				},
			],
		},
		type: "assistant",
	},
];

const CLOSED_STAGE_RECORD = {
	grade: {
		dimensions: [],
		hardBlockers: [
			{
				evidence: [
					{
						claim: "The agent asked before choosing a scope",
						locator: {
							end: 12,
							exchange: 0,
							field: "message",
							kind: "exchange",
							start: 0,
						},
						path: "transcript",
						quote: "Which scope?",
						source: "transcript",
					},
				],
				id: "HB-1",
				status: "PASS",
			},
		],
		requirements: [
			{
				evidence: [
					{
						claim: "The shape names the scope",
						path: "backlog/docs/shape.md",
						source: "artifact",
					},
					{
						claim: "The owner chose the small scope",
						path: "transcript",
						quote: "Use the small scope",
						source: "transcript",
					},
				],
				id: "R1",
				status: "PASS",
			},
		],
	},
	stage: "build",
};

export {
	startStageSessionApi,
	RUN,
	SESSION_ID,
	startedStage,
	queuedStage,
	recordStart,
	transcriptOf,
	toolResultTranscript,
	clearStageSessionRoots,
	RUNNING_TRANSCRIPT,
	CLOSED_STAGE_RECORD,
};

export type { StartedStage };
