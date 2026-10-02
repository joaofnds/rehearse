import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { benchmarkRunPaths, runNameFromTimestamp } from "#benchmark/run-layout";
import type { RunLiveness } from "#benchmark/run-liveness";
import { writeRunManifest } from "#benchmark/manifest";
import type { RunManifest } from "#benchmark/manifest";
import type { PipelineDefinition } from "#benchmark/pipeline";
import { FakeLauncher } from "./launch-test-support";
import { createLaunchApp } from "./launches";

const NOTHING_RUNNING: RunLiveness = {
	readMarker: () => Promise.resolve(undefined),
	isAlive: () => false,
};

const DECLARED_PIPELINE = "cases/pipe-case/pipeline.json";
const OVERRIDE_PIPELINE = "cases/pipe-case/override.json";

const PIPELINE_CASE = {
	id: "pipe-case",
	kind: "pipeline",
	title: "A pipeline case",
	task: "task.md",
	productBrief: "brief.md",
	finalRubric: "rubric.md",
	pipeline: "pipeline.json",
	rubrics: "rubrics",
	target: { path: "/target" },
};

const SESSION_CASE = {
	id: "sess-case",
	kind: "session",
	title: "A session case",
	prompt: "Reply OK.",
	tools: [],
	corpusFiles: [],
	checks: [{ kind: "word-band", max: 1 }],
};

function pipelineDefinition(stages: readonly string[]): PipelineDefinition {
	return {
		statuses: ["To Do", "Done"],
		target: {
			checks: [{ command: ["bun", "run", "typecheck"] }],
			integrityFiles: ["package.json"],
		},
		stages: stages.map((name) => ({
			name,
			kind: "delivery",
			skill: name,
			rubric: `${name}.json`,
		})),
	};
}

interface RecordedRun {
	readonly timestamp: string;
	readonly caseId: string;
	readonly pipelinePath: string;
	readonly stages: readonly string[];
	readonly corpusDigest?: string;
}

describe("/api/pipelines", () => {
	const roots: string[] = [];

	afterEach(async () => {
		await Promise.all(
			roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
		);
	});

	async function temporaryDirectory(prefix: string): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), prefix));
		roots.push(root);

		return root;
	}

	async function casesRoot(
		declarations: readonly { readonly id: string }[],
	): Promise<string> {
		const root = await temporaryDirectory("rehearse-pipeline-cases-");
		for (const declaration of declarations) {
			await mkdir(join(root, declaration.id), { recursive: true });
			await Bun.write(
				join(root, declaration.id, "case.json"),
				JSON.stringify(declaration),
			);
		}
		await Bun.write(
			join(root, "pipe-case", "pipeline.json"),
			JSON.stringify(pipelineDefinition(["discuss", "build"])),
		);

		return root;
	}

	async function recordRun(
		runsDirectory: string,
		run: RecordedRun,
	): Promise<string> {
		const name = runNameFromTimestamp(run.timestamp);
		const { checkpointsDirectory, manifestFile } = benchmarkRunPaths(
			runsDirectory,
			name,
		);
		await mkdir(checkpointsDirectory, { recursive: true });
		const manifest: RunManifest = {
			caseId: run.caseId,
			timestamp: run.timestamp,
			controlSha: "1".repeat(40),
			sourceRoot: "/target",
			sourceSha: "2".repeat(40),
			taskId: "ACT-1",
			taskSha: "3".repeat(40),
			task: "the task",
			productBrief: "the brief",
			model: "sonnet",
			judgeModel: "opus",
			sessionBudgetUsd: 5,
			pipelinePath: run.pipelinePath,
			pipeline: pipelineDefinition(run.stages),
		};
		await writeRunManifest(
			manifestFile,
			run.corpusDigest === undefined
				? manifest
				: {
						...manifest,
						corpusVersion: { kind: "version", digest: run.corpusDigest },
					},
		);

		return name;
	}

	async function serving(
		runs: readonly RecordedRun[],
	): Promise<{ readonly get: () => Promise<Response>; names: string[] }> {
		const runsDirectory = await temporaryDirectory("rehearse-pipeline-runs-");
		const names: string[] = [];
		for (const run of runs) {
			names.push(await recordRun(runsDirectory, run));
		}
		const app = createLaunchApp({
			runsDirectory,
			casesRoot: await casesRoot([PIPELINE_CASE, SESSION_CASE]),
			launcher: new FakeLauncher(),
			liveness: NOTHING_RUNNING,
		});

		return {
			get: () => Promise.resolve(app.request("/api/pipelines")),
			names,
		};
	}

	it("lists a case's own pipeline and a pipeline a run chose instead as two tasks", async () => {
		const { get, names } = await serving([
			{
				timestamp: "2026-09-01T10:00:00.000Z",
				caseId: "pipe-case",
				pipelinePath: DECLARED_PIPELINE,
				stages: ["discuss", "build"],
			},
			{
				timestamp: "2026-09-02T10:00:00.000Z",
				caseId: "pipe-case",
				pipelinePath: OVERRIDE_PIPELINE,
				stages: ["build"],
			},
		]);
		const [declaredRun, overrideRun] = names;

		const response = await get();

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			pipelines: [
				{
					path: OVERRIDE_PIPELINE,
					stages: ["build"],
					stageJudges: 1,
					taskJudges: 0,
					declaredBy: null,
					cases: ["pipe-case"],
					runs: [overrideRun],
					figures: { counted: 1, corpusVersion: null, leftOut: 0 },
				},
				{
					path: DECLARED_PIPELINE,
					stages: ["discuss", "build"],
					stageJudges: 2,
					taskJudges: 1,
					declaredBy: {
						id: "pipe-case",
						title: "A pipeline case",
						target: "/target",
					},
					cases: ["pipe-case"],
					runs: [declaredRun],
					figures: { counted: 1, corpusVersion: null, leftOut: 0 },
				},
			],
			unreadable: [],
		});
	});
});
