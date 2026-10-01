import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeRunManifest } from "#benchmark/manifest";
import { openRunEventStore } from "#benchmark/run-events";
import {
	benchmarkRunPaths,
	runEventsDatabaseFile,
} from "#benchmark/run-layout";
import { projectSlug } from "#benchmark/session-capture";
import { TEST_TARGET } from "#benchmark/test-support";
import {
	directorySource,
	fixedCorpusSource,
	nothingRunning,
} from "#benchmark/run-records-test-support";
import { createApiApp } from "./api";
import { readStageSession } from "./stage-session";

const RUN = "2026-10-01T10-00-00.000Z";
const SESSION_ID = "0b7e8d0c-2f4c-4a54-9a3e-6f1d2c3b4a59";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
	);
});

interface StartedStage {
	readonly runsDirectory: string;
	readonly projectsDirectory: string;
	readonly transcriptFile: string;
}

async function startedStage(): Promise<StartedStage> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-stage-session-"));
	roots.push(root);
	const runsDirectory = join(root, ".benchmark-runs");
	const projectsDirectory = join(root, "projects");
	const sourceRoot = join(root, "source");
	await writeRunManifest(benchmarkRunPaths(runsDirectory, RUN).manifestFile, {
		caseId: "audit-log",
		timestamp: "2026-10-01T10:00:00.000Z",
		controlSha: "control-sha",
		sourceRoot,
		sourceSha: "source-sha",
		taskId: "TASK-1",
		taskSha: "task-sha",
		task: "Task text",
		productBrief: "Brief text",
		model: "sonnet",
		judgeModel: "opus",
		sessionBudgetUsd: 5,
		pipeline: {
			statuses: ["To Do", "Done"],
			target: TEST_TARGET,
			stages: [
				{
					name: "build",
					kind: "delivery",
					skill: "build",
					rubric: "rubrics/build.json",
				},
			],
		},
		pipelinePath: "pipelines/default.json",
	});
	const store = await openRunEventStore(runEventsDatabaseFile(runsDirectory));
	store.append({
		runId: RUN,
		kind: "stage-started",
		stage: "build",
		spentUsd: 0,
		elapsedMs: 0,
		sessionId: SESSION_ID,
	});
	store.close();
	const projectDirectory = join(projectsDirectory, projectSlug(sourceRoot));
	await mkdir(projectDirectory, { recursive: true });

	return {
		runsDirectory,
		projectsDirectory,
		transcriptFile: join(projectDirectory, `${SESSION_ID}.jsonl`),
	};
}

function transcriptOf(records: readonly unknown[]): string {
	return records.map((record) => `${JSON.stringify(record)}\n`).join("");
}

describe(readStageSession.name, () => {
	it("answers a running stage with its transcript's rows and its latest tool call", async () => {
		const stage = await startedStage();
		await Bun.write(
			stage.transcriptFile,
			transcriptOf([
				{
					type: "user",
					message: { content: "Work TASK-1 with the build skill" },
				},
				{
					type: "assistant",
					message: { content: [{ type: "text", text: "Reading the card." }] },
				},
				{
					type: "assistant",
					message: {
						content: [
							{
								type: "tool_use",
								id: "t1",
								name: "Read",
								input: { file_path: "src/auth/session.ts" },
							},
						],
					},
				},
				{
					type: "user",
					message: {
						content: [
							{
								type: "tool_result",
								tool_use_id: "t1",
								content: "export function session() {}\nthe rest",
							},
						],
					},
				},
				{
					type: "assistant",
					message: {
						content: [
							{
								type: "tool_use",
								id: "t2",
								name: "Bash",
								input: { command: "bun test" },
							},
						],
					},
				},
			]),
		);

		const session = await readStageSession({
			...stage,
			run: RUN,
			stage: "build",
		});

		expect(session).toEqual({
			state: "running",
			lineCount: 5,
			lines: [
				{ line: 1, kind: "user", text: "Work TASK-1 with the build skill" },
				{ line: 2, kind: "assistant", text: "Reading the card." },
				{ line: 3, kind: "tool", text: "Read  src/auth/session.ts" },
				{ line: 4, kind: "result", text: "export function session() {}" },
				{ line: 5, kind: "tool", text: "Bash  bun test" },
			],
			latestToolCall: "Bash  bun test",
		});
	});

	it("shows only the transcript's last 200 lines while counting every one", async () => {
		const stage = await startedStage();
		await Bun.write(
			stage.transcriptFile,
			transcriptOf(
				Array.from({ length: 250 }, (_unused, index) => ({
					type: "assistant",
					message: {
						content: [{ type: "text", text: `step ${String(index + 1)}` }],
					},
				})),
			),
		);

		const session = await readStageSession({
			...stage,
			run: RUN,
			stage: "build",
		});

		expect(session).toMatchObject({ state: "running", lineCount: 250 });
		expect(session.state === "running" && session.lines.at(0)).toEqual({
			line: 51,
			kind: "assistant",
			text: "step 51",
		});
	});

	it("shows no row for a skill body the provider marks as meta", async () => {
		const stage = await startedStage();
		await Bun.write(
			stage.transcriptFile,
			transcriptOf([
				{
					type: "user",
					isMeta: true,
					message: {
						content: [
							{
								type: "text",
								text: "Base directory for this skill: /skills/build",
							},
						],
					},
				},
				{ type: "attachment", attachment: { type: "output_style" } },
			]),
		);

		const session = await readStageSession({
			...stage,
			run: RUN,
			stage: "build",
		});

		expect(session).toEqual({ state: "running", lineCount: 2, lines: [] });
	});
});

describe("GET /api/runs/:run/stages/:stage/session", () => {
	it("answers with the stage's session as the reader shows it", async () => {
		const stage = await startedStage();
		await Bun.write(
			stage.transcriptFile,
			transcriptOf([
				{
					type: "assistant",
					message: { content: [{ type: "text", text: "Reading the card." }] },
				},
			]),
		);
		const app = createApiApp({
			runsDirectory: stage.runsDirectory,
			projectsDirectory: stage.projectsDirectory,
			liveness: nothingRunning,
			readCorpusSource: fixedCorpusSource(directorySource(stage.runsDirectory)),
		});

		const response = await app.request(`/api/runs/${RUN}/stages/build/session`);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			state: "running",
			lineCount: 1,
			lines: [{ line: 1, kind: "assistant", text: "Reading the card." }],
		});
	});
});
