import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { CONTROL_DIR } from "#benchmark/config";
import type { RunLiveness } from "#benchmark/run-liveness";
import { directoryLiveCorpus, FakeLauncher } from "./launch-test-support";
import { runCommand } from "#benchmark/command";
import { createLaunchApp } from "./launches";
import { projectFormatted } from "#benchmark/project-format";

const NOTHING_RUNNING: RunLiveness = {
	readMarker: () => Promise.resolve(undefined),
	isAlive: () => false,
};

const PIPELINE_CASE = {
	id: "pipe-case",
	kind: "pipeline",
	title: "A pipeline case",
	task: "task.md",
	productBrief: "brief.md",
	finalRubric: "rubric.md",
	pipeline: "pipeline.json",
	rubrics: "rubrics",
	target: { path: "../../target" },
	model: "sonnet",
	sessionBudgetUsd: 5,
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

const TASK = "# Add an audit log\n\nRecord every write.\n";
const BRIEF = "# Brief\n\nOperators read the log.\n";
const FINAL_RUBRIC = "# Final rubric\n\nThe log records every write.\n";

const PIPELINE = {
	statuses: ["To Do", "Done"],
	target: {
		setup: [{ command: ["bun", "install"] }],
		checks: [{ command: ["bun", "run", "typecheck"] }],
		integrityFiles: ["package.json"],
	},
	stages: [
		{
			name: "shape",
			kind: "planning",
			skill: "shape",
			rubric: "cases/pipe-case/rubrics/shape.json",
		},
		{
			name: "build",
			kind: "delivery",
			skill: "build",
			rubric: "cases/pipe-case/rubrics/build.json",
		},
	],
};

const POSTGRES = {
	name: "postgres",
	image: "postgres:18-alpine",
	port: 5432,
	env: { POSTGRES_PASSWORD: "postgres" },
	ready: ["pg_isready", "-h", "127.0.0.1"],
	exports: {
		DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:{port}/app",
	},
};

const BUNDLE_STAGES = [
	{ name: "shape", kind: "planning", skill: "shape", rubric: "shape.json" },
	{ name: "build", kind: "delivery", skill: "build", rubric: "build.json" },
];

const bundleSchema = z.looseObject({
	caseId: z.string(),
	pipeline: z.looseObject({ stages: z.array(z.looseObject({})) }),
	rubrics: z.record(z.string(), z.string()),
});

type ExportedBundle = z.infer<typeof bundleSchema>;

const refusalSchema = z.object({ error: z.string().min(1) });

describe("task bundles", () => {
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

	async function repository(): Promise<string> {
		const directory = await temporaryDirectory("rehearse-bundle-target-");
		await runCommand(["git", "init", "-b", "main"], directory);

		return directory;
	}

	interface Serving {
		readonly request: (path: string, init?: RequestInit) => Promise<Response>;
		readonly post: (path: string, json: string) => Promise<Response>;
		readonly cases: string;
	}

	async function serving(): Promise<Serving> {
		const cases = await temporaryDirectory("rehearse-bundle-cases-");
		for (const declaration of [PIPELINE_CASE, SESSION_CASE]) {
			await mkdir(join(cases, declaration.id), { recursive: true });
			await Bun.write(
				join(cases, declaration.id, "case.json"),
				JSON.stringify(declaration),
			);
		}
		const directory = join(cases, "pipe-case");
		await Bun.write(join(directory, "pipeline.json"), JSON.stringify(PIPELINE));
		await Bun.write(join(directory, "task.md"), TASK);
		await Bun.write(join(directory, "brief.md"), BRIEF);
		await Bun.write(join(directory, "rubric.md"), FINAL_RUBRIC);
		for (const rubric of ["shape.json", "build.json"]) {
			await Bun.write(
				join(directory, "rubrics", rubric),
				await Bun.file(
					join(CONTROL_DIR, "cases/audit-log/rubrics", rubric),
				).text(),
			);
		}
		const runsDirectory = await temporaryDirectory("rehearse-bundle-runs-");
		const app = createLaunchApp({
			runsDirectory,
			casesRoot: cases,
			launcher: new FakeLauncher(),
			liveness: NOTHING_RUNNING,
			liveCorpus: () => directoryLiveCorpus(runsDirectory),
			home: runsDirectory,
		});
		const request = (path: string, init?: RequestInit): Promise<Response> =>
			Promise.resolve(app.request(path, init));

		return {
			request,
			post: (path, json) =>
				request(path, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: json,
				}),
			cases,
		};
	}

	async function exported(server: Serving): Promise<ExportedBundle> {
		const response = await server.request("/api/cases/pipe-case/bundle");
		expect(response.status).toBe(200);

		return bundleSchema.parse(await response.json());
	}

	async function refusal(response: Response): Promise<string> {
		const body = refusalSchema.parse(await response.json());

		return body.error;
	}

	it("exports a pipeline case with its steps naming their judges by file name", async () => {
		const server = await serving();

		const response = await server.request("/api/cases/pipe-case/bundle");

		expect(response.status).toBe(200);
		expect(response.headers.get("content-disposition")).toBe(
			'attachment; filename="pipe-case.task.json"',
		);
		const bundle = bundleSchema.parse(await response.json());
		expect(bundle).toMatchObject({
			format: "rehearse-task-bundle",
			version: 1,
			caseId: "pipe-case",
			title: "A pipeline case",
			target: { path: "../../target" },
			model: "sonnet",
			sessionBudgetUsd: 5,
			task: TASK,
			productBrief: BRIEF,
			finalRubric: FINAL_RUBRIC,
			pipeline: { ...PIPELINE, stages: BUNDLE_STAGES },
		});
		expect(Object.keys(bundle.rubrics).toSorted()).toEqual([
			"build.json",
			"shape.json",
		]);
	});

	it.each(["sess-case", "no-such-case"])(
		"answers 404 for exporting %s, which declares no pipeline",
		async (caseId) => {
			const server = await serving();

			const response = await server.request(`/api/cases/${caseId}/bundle`);

			expect(response.status).toBe(404);
		},
	);

	it("previews a bundle's steps, judges and the commands it runs, writing nothing", async () => {
		const server = await serving();
		const bundle = await exported(server);

		const response = await server.post(
			"/api/task-bundles/preview",
			JSON.stringify({
				bundle,
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			caseId: "pipe-case",
			title: "A pipeline case",
			targetPath: "../../target",
			model: "sonnet",
			steps: [
				{ name: "shape", kind: "planning", skill: "shape" },
				{ name: "build", kind: "delivery", skill: "build" },
			],
			commands: ["bun install", "bun run typecheck"],
			services: [],
			stepJudges: 2,
		});
	});

	it("previews the containers a bundle's target starts and the variables each exports", async () => {
		const server = await serving();
		const bundle = await exported(server);
		const target = { ...PIPELINE.target, services: [POSTGRES] };

		const response = await server.post(
			"/api/task-bundles/preview",
			JSON.stringify({
				bundle: { ...bundle, pipeline: { ...bundle.pipeline, target } },
			}),
		);

		expect(await response.json()).toMatchObject({
			services: [
				{
					name: "postgres",
					image: "postgres:18-alpine",
					exports: ["DATABASE_URL"],
				},
			],
		});
	});

	it("imports a bundle as a new case whose steps name its own judges", async () => {
		const server = await serving();
		const target = await repository();
		const bundle = await exported(server);

		const response = await server.post(
			"/api/cases/import",
			JSON.stringify({
				id: "pipe-copy",
				title: "A copied case",
				targetPath: target,
				bundle,
			}),
		);

		expect(response.status).toBe(201);
		expect(await response.json()).toEqual({
			caseId: "pipe-copy",
			path: "cases/pipe-copy",
		});
		const steps = await server.request("/api/cases/pipe-copy/steps");
		expect(await steps.json()).toMatchObject({
			stages: [
				{ name: "shape", rubric: "cases/pipe-copy/rubrics/shape.json" },
				{ name: "build", rubric: "cases/pipe-copy/rubrics/build.json" },
			],
		});
		const again = await server.request("/api/cases/pipe-copy/bundle");
		expect(await again.json()).toEqual({
			...bundle,
			caseId: "pipe-copy",
			title: "A copied case",
			target: { path: target },
		});
	});

	it("writes every imported file as the project's formatter would", async () => {
		const server = await serving();
		const bundle = await exported(server);

		await server.post(
			"/api/cases/import",
			JSON.stringify({
				id: "pipe-copy",
				title: "A copied case",
				targetPath: await repository(),
				bundle,
			}),
		);

		for (const file of [
			"case.json",
			"pipeline.json",
			"task.md",
			"product-brief.md",
			"rubric.md",
			"rubrics/build.json",
		]) {
			const path = join(server.cases, "pipe-copy", file);
			const text = await Bun.file(path).text();
			expect(await projectFormatted(path, text)).toBe(text);
		}
	});

	it("answers 409 for an id already on disk and leaves that case as it was", async () => {
		const server = await serving();
		const before = await Bun.file(
			join(server.cases, "pipe-case", "case.json"),
		).text();

		const response = await server.post(
			"/api/cases/import",
			JSON.stringify({
				id: "pipe-case",
				title: "A copied case",
				targetPath: await repository(),
				bundle: await exported(server),
			}),
		);

		expect(response.status).toBe(409);
		expect(
			await Bun.file(join(server.cases, "pipe-case", "case.json")).text(),
		).toBe(before);
	});

	it.each([
		{ refusing: "a target that is not a git repository", target: "plain" },
		{ refusing: "the control repository as its target", target: "control" },
		{ refusing: "a target that does not exist", target: "missing" },
	] as const)("refuses $refusing and writes no case", async ({ target }) => {
		const server = await serving();
		const targets = {
			plain: await temporaryDirectory("rehearse-bundle-plain-"),
			control: CONTROL_DIR,
			missing: join(tmpdir(), "rehearse-no-such-target"),
		};

		const response = await server.post(
			"/api/cases/import",
			JSON.stringify({
				id: "pipe-copy",
				title: "A copied case",
				targetPath: targets[target],
				bundle: await exported(server),
			}),
		);

		expect(response.status).toBe(400);
		expect(await refusal(response)).toContain("Target");
		expect(await Bun.file(join(server.cases, "pipe-copy")).exists()).toBe(
			false,
		);
	});

	it("refuses a step whose judge the bundle does not carry and removes what it wrote", async () => {
		const server = await serving();
		const bundle = await exported(server);
		const { "build.json": _dropped, ...rubrics } = bundle.rubrics;

		const response = await server.post(
			"/api/cases/import",
			JSON.stringify({
				id: "pipe-copy",
				title: "A copied case",
				targetPath: await repository(),
				bundle: { ...bundle, rubrics },
			}),
		);

		expect(response.status).toBe(400);
		expect(await refusal(response)).toContain("build");
		expect(
			await Bun.file(join(server.cases, "pipe-copy", "case.json")).exists(),
		).toBe(false);
	});

	it("refuses a bundled step that names its judge by path", async () => {
		const server = await serving();
		const bundle = await exported(server);

		const response = await server.post(
			"/api/task-bundles/preview",
			JSON.stringify({
				bundle: {
					...bundle,
					pipeline: {
						...bundle.pipeline,
						stages: [{ ...BUNDLE_STAGES[1], rubric: "../build.json" }],
					},
				},
			}),
		);

		expect(response.status).toBe(400);
		expect(await refusal(response)).toContain("rubric file name");
	});

	it("declares a pipeline case from the operator's task with another case's steps and judges", async () => {
		const server = await serving();
		const target = await repository();

		const response = await server.post(
			"/api/cases/pipeline",
			JSON.stringify({
				id: "new-task",
				title: "A new task",
				targetPath: target,
				task: "# Rename the module\n",
				productBrief: "# Why\n\nThe name misleads.\n",
				from: "pipe-case",
			}),
		);

		expect(response.status).toBe(201);
		expect(
			await Bun.file(join(server.cases, "new-task", "task.md")).text(),
		).toBe("# Rename the module\n");
		const bundle = await server.request("/api/cases/new-task/bundle");
		expect(await bundle.json()).toMatchObject({
			title: "A new task",
			target: { path: target },
			model: "sonnet",
			finalRubric: FINAL_RUBRIC,
			productBrief: "# Why\n\nThe name misleads.\n",
			pipeline: { stages: BUNDLE_STAGES },
		});
	});

	it("answers 404 for declaring a pipeline case from a session case", async () => {
		const server = await serving();

		const response = await server.post(
			"/api/cases/pipeline",
			JSON.stringify({
				id: "new-task",
				title: "A new task",
				targetPath: await repository(),
				task: "# Rename the module\n",
				productBrief: "# Why\n",
				from: "sess-case",
			}),
		);

		expect(response.status).toBe(404);
	});
});
