import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
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
	const projectDirectory = join(projectsDirectory, projectSlug(sourceRoot));
	await mkdir(projectDirectory, { recursive: true });

	return {
		runsDirectory,
		projectsDirectory,
		transcriptFile: join(projectDirectory, `${sessionId}.jsonl`),
	};
}

async function recordStart(
	runsDirectory: string,
	sessionId: string | undefined,
): Promise<void> {
	const store = await openRunEventStore(runEventsDatabaseFile(runsDirectory));
	store.append({
		runId: RUN,
		kind: "stage-started",
		stage: "build",
		spentUsd: 0,
		elapsedMs: 0,
		sessionId,
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

	it("answers a stage that has not started yet as not started", async () => {
		const stage = await queuedStage();

		const session = await readStageSession({
			...stage,
			run: RUN,
			stage: "build",
		});

		expect(session).toEqual({ state: "not-started" });
	});

	it("answers a stage whose start carries no session id as untracked", async () => {
		const stage = await queuedStage();
		await recordStart(stage.runsDirectory, undefined);

		const session = await readStageSession({
			...stage,
			run: RUN,
			stage: "build",
		});

		expect(session).toEqual({ state: "untracked" });
	});
});

describe(`${readStageSession.name} once the stage has closed`, () => {
	it("answers the spans the judge cites from the transcript and the preserved transcript's place", async () => {
		const stage = await startedStage();
		const paths = benchmarkRunPaths(stage.runsDirectory, RUN);
		await Bun.write(
			join(paths.checkpointDirectory("build"), "transcript.jsonl"),
			transcriptOf([{ type: "user" }, { type: "assistant" }, { type: "user" }]),
		);
		await Bun.write(
			paths.stageFile("build"),
			JSON.stringify({
				stage: "build",
				grade: {
					hardBlockers: [
						{
							id: "HB-1",
							status: "PASS",
							evidence: [
								{
									source: "transcript",
									path: "transcript",
									claim: "The agent asked before choosing a scope",
									quote: "Which scope?",
									locator: {
										kind: "exchange",
										exchange: 0,
										field: "message",
										start: 0,
										end: 12,
									},
								},
							],
						},
					],
					requirements: [
						{
							id: "R1",
							status: "PASS",
							evidence: [
								{
									source: "artifact",
									path: "backlog/docs/shape.md",
									claim: "The shape names the scope",
								},
								{
									source: "transcript",
									path: "transcript",
									claim: "The owner chose the small scope",
									quote: "Use the small scope",
								},
							],
						},
					],
					dimensions: [],
				},
			}),
		);

		const session = await readStageSession({
			...stage,
			run: RUN,
			stage: "build",
		});

		expect(session).toEqual({
			state: "closed",
			lineCount: 3,
			transcriptPath: `.benchmark-runs/${RUN}.checkpoints/build/transcript.jsonl`,
			spans: [
				{
					section: "hardBlockers",
					item: "HB-1",
					index: 0,
					claim: "The agent asked before choosing a scope",
					quote: "Which scope?",
					exchange: 1,
					field: "message",
				},
				{
					section: "requirements",
					item: "R1",
					index: 1,
					claim: "The owner chose the small scope",
					quote: "Use the small scope",
				},
			],
		});
	});

	it("answers a closed stage with no preserved transcript and no grade with neither", async () => {
		const stage = await startedStage();
		await Bun.write(
			benchmarkRunPaths(stage.runsDirectory, RUN).stageFile("build"),
			JSON.stringify({ stage: "build", error: "Run stopped" }),
		);

		const session = await readStageSession({
			...stage,
			run: RUN,
			stage: "build",
		});

		expect(session).toEqual({ state: "closed", spans: [] });
	});

	it("fails on a record whose grade does not hold the judged items", async () => {
		const stage = await startedStage();
		await Bun.write(
			benchmarkRunPaths(stage.runsDirectory, RUN).stageFile("build"),
			JSON.stringify({ stage: "build", grade: { hardBlockers: "none" } }),
		);

		const session = readStageSession({ ...stage, run: RUN, stage: "build" });

		expect(session).rejects.toThrow(z.ZodError);
	});

	it("answers the spans a stage judge cites in the record of the stage that stopped the run", async () => {
		const stage = await startedStage();
		await Bun.write(
			benchmarkRunPaths(stage.runsDirectory, RUN).stageFile("build"),
			JSON.stringify({
				status: "STAGE_JUDGE_FAILED",
				stage: "build",
				error: "Stage build graded D below the minimum C",
				hardBlockers: [
					{
						id: "HB-1",
						status: "FAIL",
						evidence: [
							{
								source: "transcript",
								path: "transcript",
								claim: "The agent chose a scope without asking",
							},
						],
					},
				],
				requirements: [],
				dimensions: [],
				grade: { grade: "D", verdict: "Below the bar" },
			}),
		);

		const session = await readStageSession({
			...stage,
			run: RUN,
			stage: "build",
		});

		expect(session).toEqual({
			state: "closed",
			spans: [
				{
					section: "hardBlockers",
					item: "HB-1",
					index: 0,
					claim: "The agent chose a scope without asking",
				},
			],
		});
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

describe("GET /api/runs/:run/stages/:stage/session refusals", () => {
	function appFor(stage: StartedStage): ReturnType<typeof createApiApp> {
		return createApiApp({
			runsDirectory: stage.runsDirectory,
			projectsDirectory: stage.projectsDirectory,
			liveness: nothingRunning,
			readCorpusSource: fixedCorpusSource(directorySource(stage.runsDirectory)),
		});
	}

	it("refuses a recorded session id that is not a uuid", async () => {
		const stage = await startedStage("not-a-uuid");
		await Bun.write(stage.transcriptFile, transcriptOf([]));

		const response = await appFor(stage).request(
			`/api/runs/${RUN}/stages/build/session`,
		);

		expect(response.status).toBe(400);
	});

	it("refuses a transcript that links out of the projects directory", async () => {
		const stage = await startedStage();
		const outside = join(stage.runsDirectory, "outside.jsonl");
		await Bun.write(outside, transcriptOf([]));
		await symlink(outside, stage.transcriptFile);

		const response = await appFor(stage).request(
			`/api/runs/${RUN}/stages/build/session`,
		);

		expect(response.status).toBe(400);
	});

	it("refuses a project directory that links out of the projects directory", async () => {
		const stage = await startedStage();
		const outside = join(stage.runsDirectory, "outside-project");
		await mkdir(outside);
		await Bun.write(join(outside, `${SESSION_ID}.jsonl`), transcriptOf([]));
		const projectDirectory = join(stage.transcriptFile, "..");
		await rm(projectDirectory, { recursive: true });
		await symlink(outside, projectDirectory);

		const response = await appFor(stage).request(
			`/api/runs/${RUN}/stages/build/session`,
		);

		expect(response.status).toBe(400);
	});

	it("answers 404 for a stage the run's pipeline does not have", async () => {
		const stage = await startedStage();

		const response = await appFor(stage).request(
			`/api/runs/${RUN}/stages/deploy/session`,
		);

		expect(response.status).toBe(404);
	});

	it.each(["..%2F..%2Fetc", "..%5C..%5Cetc", ".hidden"])(
		"refuses the traversing run id %s",
		async (run) => {
			const stage = await startedStage();

			const response = await appFor(stage).request(
				`/api/runs/${run}/stages/build/session`,
			);

			expect(response.status).toBe(400);
		},
	);
});
