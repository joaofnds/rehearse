import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { confirmationGroupRecordSchema } from "#benchmark/confirmation-record";
import {
	benchmarkRunPaths,
	confirmationGroupPaths,
	runNameFromTimestamp,
} from "#benchmark/run-layout";
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

function rubricPath(stage: string): string {
	return `cases/pipe-case/rubrics/${stage}.json`;
}

function pipelineDefinition(stages: readonly string[]): PipelineDefinition {
	return {
		statuses: ["To Do", "Done"],
		target: {
			checks: [{ command: ["bun", "run", "typecheck"] }],
			integrityFiles: ["package.json"],
		},
		stages: stages.map((name, index) =>
			index === stages.length - 1
				? { name, kind: "delivery", skill: name, rubric: rubricPath(name) }
				: {
						name,
						kind: "planning",
						skill: name,
						rubric: rubricPath(name),
						requiresAcceptanceCriteria: false,
					},
		),
	};
}

const pipelinesResponseSchema = z.object({
	pipelines: z.array(
		z
			.object({
				path: z.string(),
				stages: z.array(z.string()),
				cases: z.array(z.string()),
				runs: z.array(z.string()),
				figures: z.object({
					counted: z.number(),
					corpusVersion: z.string().nullable(),
					leftOut: z.number(),
				}),
			})
			.loose(),
	),
	unreadable: z.array(z.object({ id: z.string(), reason: z.string() })),
});

type PipelinesResponse = z.infer<typeof pipelinesResponseSchema>;

const OLDER_DIGEST = "a".repeat(64);
const NEWER_DIGEST = "b".repeat(64);

interface RecordedRun {
	readonly timestamp: string;
	readonly caseId: string;
	readonly pipelinePath: string;
	readonly stages: readonly string[];
	readonly corpusDigest?: string;
}

interface RecordedGroup {
	readonly groupId: string;
	readonly caseId: string;
	readonly pipelinePath: string;
	readonly stages: readonly string[];
	readonly reps: number;
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
		for (const stage of ["discuss", "build"]) {
			await Bun.write(
				join(root, "pipe-case", "rubrics", `${stage}.json`),
				"{}",
			);
		}

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

	async function recordGroup(
		runsDirectory: string,
		group: RecordedGroup,
	): Promise<void> {
		const paths = confirmationGroupPaths(runsDirectory, group.groupId);
		const ordinals = Array.from(
			{ length: group.reps },
			(_slot, index) => index + 1,
		);
		const record = confirmationGroupRecordSchema.parse({
			schemaVersion: 1,
			caseId: group.caseId,
			groupId: group.groupId,
			mode: "pipeline",
			reps: group.reps,
			declaredStages: group.stages,
			inputs: {
				lineage: { kind: "SOURCE", sha: "2".repeat(40) },
				files: [
					{
						kind: "corpus",
						path: "inputs/corpus/SKILL.md",
						sha256: "c".repeat(64),
					},
				],
				model: "sonnet",
				judgeModel: "opus",
				sessionBudgetUsd: 5,
				pipelinePath: group.pipelinePath,
				corpusVersion:
					group.corpusDigest === undefined
						? undefined
						: { kind: "version", digest: group.corpusDigest },
			},
			projectedCost: {
				reps: group.reps,
				perRepMaximumUsd: 5,
				totalMaximumUsd: 5 * group.reps,
			},
			approval: { method: "yes", approved: true },
			repRecords: ordinals.map((ordinal) => ({
				repId: `${group.groupId}-rep-${ordinal}`,
				ordinal,
				path: `reps/${group.groupId}-rep-${ordinal}/rep.json`,
			})),
			reportFile: "report.json",
			makespanMs: 200,
		});
		await mkdir(paths.directory, { recursive: true });
		await Bun.write(paths.groupFile, JSON.stringify(record));
	}

	interface Serving {
		readonly get: () => Promise<Response>;
		readonly list: () => Promise<PipelinesResponse>;
		readonly names: readonly string[];
		readonly runsDirectory: string;
		readonly cases: string;
	}

	async function serving(
		runs: readonly RecordedRun[],
		groups: readonly RecordedGroup[] = [],
	): Promise<Serving> {
		const runsDirectory = await temporaryDirectory("rehearse-pipeline-runs-");
		const names: string[] = [];
		for (const run of runs) {
			names.push(await recordRun(runsDirectory, run));
		}
		for (const group of groups) {
			await recordGroup(runsDirectory, group);
		}
		const cases = await casesRoot([PIPELINE_CASE, SESSION_CASE]);
		const app = createLaunchApp({
			runsDirectory,
			casesRoot: cases,
			launcher: new FakeLauncher(),
			liveness: NOTHING_RUNNING,
		});
		const get = (): Promise<Response> =>
			Promise.resolve(app.request("/api/pipelines"));

		return {
			get,
			list: async () => {
				const response = await get();

				return pipelinesResponseSchema.parse(await response.json());
			},
			names,
			runsDirectory,
			cases,
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
					targets: ["/target"],
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
					targets: ["/target"],
					runs: [declaredRun],
					figures: { counted: 1, corpusVersion: null, leftOut: 0 },
				},
			],
			unreadable: [],
		});
	});

	it("reads a declared pipeline no run recorded from its file", async () => {
		const { list } = await serving([]);

		const { pipelines } = await list();

		expect(pipelines).toMatchObject([
			{
				path: DECLARED_PIPELINE,
				stages: ["discuss", "build"],
				cases: ["pipe-case"],
				runs: [],
				figures: { counted: 0, corpusVersion: null, leftOut: 0 },
			},
		]);
	});

	it("names every case that ran a task beside the case that declares it", async () => {
		const { list } = await serving([
			{
				timestamp: "2026-09-01T10:00:00.000Z",
				caseId: "retired-case",
				pipelinePath: DECLARED_PIPELINE,
				stages: ["discuss", "build"],
			},
		]);

		const { pipelines } = await list();

		expect(pipelines).toMatchObject([
			{ cases: ["pipe-case", "retired-case"], targets: ["/target"] },
		]);
	});

	it("never lists a session case as a task", async () => {
		const { list } = await serving([
			{
				timestamp: "2026-09-01T10:00:00.000Z",
				caseId: "pipe-case",
				pipelinePath: DECLARED_PIPELINE,
				stages: ["discuss", "build"],
			},
		]);

		const { pipelines } = await list();

		expect(pipelines.map(({ path }) => path)).toEqual([DECLARED_PIPELINE]);
		expect(pipelines.flatMap(({ cases }) => cases)).not.toContain(
			SESSION_CASE.id,
		);
	});

	it("reads a recorded pipeline's stages as its newest run ran them", async () => {
		const { list } = await serving([
			{
				timestamp: "2026-09-01T10:00:00.000Z",
				caseId: "pipe-case",
				pipelinePath: DECLARED_PIPELINE,
				stages: ["discuss", "build"],
			},
			{
				timestamp: "2026-09-02T10:00:00.000Z",
				caseId: "pipe-case",
				pipelinePath: DECLARED_PIPELINE,
				stages: ["shape", "build", "review"],
			},
		]);

		const { pipelines } = await list();

		expect(pipelines.map(({ stages }) => stages)).toEqual([
			["shape", "build", "review"],
		]);
	});

	it("counts only the runs at the latest corpus version and names the runs it left out", async () => {
		const { list, names } = await serving([
			{
				timestamp: "2026-09-01T10:00:00.000Z",
				caseId: "pipe-case",
				pipelinePath: DECLARED_PIPELINE,
				stages: ["discuss", "build"],
			},
			{
				timestamp: "2026-09-02T10:00:00.000Z",
				caseId: "pipe-case",
				pipelinePath: DECLARED_PIPELINE,
				stages: ["discuss", "build"],
				corpusDigest: OLDER_DIGEST,
			},
			{
				timestamp: "2026-09-03T10:00:00.000Z",
				caseId: "pipe-case",
				pipelinePath: DECLARED_PIPELINE,
				stages: ["discuss", "build"],
				corpusDigest: NEWER_DIGEST,
			},
			{
				timestamp: "2026-09-04T10:00:00.000Z",
				caseId: "pipe-case",
				pipelinePath: DECLARED_PIPELINE,
				stages: ["discuss", "build"],
			},
		]);

		const { pipelines } = await list();

		expect(pipelines).toMatchObject([
			{
				runs: names.toReversed(),
				figures: { counted: 1, corpusVersion: NEWER_DIGEST, leftOut: 3 },
			},
		]);
	});

	describe("when a pipeline confirmation group ran the task", () => {
		it("counts each of the group's reps as a run at the version it froze", async () => {
			const { list, names } = await serving(
				[
					{
						timestamp: "2026-09-01T10:00:00.000Z",
						caseId: "pipe-case",
						pipelinePath: DECLARED_PIPELINE,
						stages: ["discuss", "build"],
						corpusDigest: NEWER_DIGEST,
					},
				],
				[
					{
						groupId: "group-a",
						caseId: "pipe-case",
						pipelinePath: DECLARED_PIPELINE,
						stages: ["discuss", "build"],
						reps: 3,
						corpusDigest: NEWER_DIGEST,
					},
				],
			);

			const { pipelines } = await list();

			expect(pipelines).toMatchObject([
				{
					runs: names,
					figures: { counted: 4, corpusVersion: NEWER_DIGEST, leftOut: 0 },
				},
			]);
		});

		it("lists a pipeline only a group ran with the stages the group declared", async () => {
			const { list } = await serving(
				[],
				[
					{
						groupId: "group-a",
						caseId: "pipe-case",
						pipelinePath: OVERRIDE_PIPELINE,
						stages: ["build"],
						reps: 2,
					},
				],
			);

			const { pipelines } = await list();

			expect(pipelines).toMatchObject([
				{
					path: OVERRIDE_PIPELINE,
					stages: ["build"],
					cases: ["pipe-case"],
					runs: [],
					figures: { counted: 2, corpusVersion: null, leftOut: 0 },
				},
				{ path: DECLARED_PIPELINE },
			]);
		});
	});

	describe("when a record cannot be read", () => {
		it("reports a declared pipeline file that does not parse and lists the rest", async () => {
			const { list, cases } = await serving([
				{
					timestamp: "2026-09-01T10:00:00.000Z",
					caseId: "pipe-case",
					pipelinePath: OVERRIDE_PIPELINE,
					stages: ["build"],
				},
			]);
			await Bun.write(join(cases, "pipe-case", "pipeline.json"), "{}");

			const { pipelines, unreadable } = await list();

			expect(pipelines.map(({ path }) => path)).toEqual([OVERRIDE_PIPELINE]);
			expect(unreadable.map(({ id }) => id)).toEqual([DECLARED_PIPELINE]);
		});

		it("reports a declared pipeline the harness would refuse to run", async () => {
			const { list, cases } = await serving([]);
			await Bun.write(
				join(cases, "pipe-case", "pipeline.json"),
				JSON.stringify(pipelineDefinition(["build", "build"])),
			);

			const { pipelines, unreadable } = await list();

			expect(pipelines).toEqual([]);
			expect(unreadable.map(({ id }) => id)).toEqual([DECLARED_PIPELINE]);
			expect(unreadable[0]?.reason).toContain("duplicate name");
		});

		it("reports a case declaration that does not parse, since it may declare a task", async () => {
			const { list, cases } = await serving([]);
			await mkdir(join(cases, "broken-case"));
			await Bun.write(join(cases, "broken-case", "case.json"), "{");

			const { unreadable } = await list();

			expect(unreadable.map(({ id }) => id)).toEqual(["broken-case"]);
		});

		it("reports a run manifest that does not parse and lists the rest", async () => {
			const { list, names, runsDirectory } = await serving([
				{
					timestamp: "2026-09-01T10:00:00.000Z",
					caseId: "pipe-case",
					pipelinePath: OVERRIDE_PIPELINE,
					stages: ["build"],
				},
			]);
			const [run = ""] = names;
			await Bun.write(benchmarkRunPaths(runsDirectory, run).manifestFile, "{}");

			const { pipelines, unreadable } = await list();

			expect(pipelines.map(({ path }) => path)).toEqual([DECLARED_PIPELINE]);
			expect(unreadable.map(({ id }) => id)).toEqual([run]);
		});
	});
});
