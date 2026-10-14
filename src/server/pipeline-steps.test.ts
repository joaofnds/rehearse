import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { format } from "oxfmt";
import { z } from "zod";
import { CONTROL_DIR } from "#benchmark/config";
import type { RunLiveness } from "#benchmark/run-liveness";
import type { PipelineDefinition } from "#benchmark/pipeline";
import { directoryLiveCorpus, FakeLauncher } from "./launch-test-support";
import { createLaunchApp } from "./launches";

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

const PLANNING_RUBRIC = "cases/pipe-case/rubrics/shape.json";
const DELIVERY_RUBRIC = "cases/pipe-case/rubrics/build.json";

const PIPELINE: PipelineDefinition = {
	statuses: ["To Do", "Done"],
	target: {
		checks: [{ command: ["bun", "run", "typecheck"] }],
		integrityFiles: ["package.json"],
	},
	stages: [
		{
			name: "shape",
			kind: "planning",
			skill: "shape",
			rubric: PLANNING_RUBRIC,
			requiresAcceptanceCriteria: true,
		},
		{
			name: "build",
			kind: "delivery",
			skill: "build",
			rubric: DELIVERY_RUBRIC,
		},
	],
};

describe("/api/cases/:id/steps", () => {
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

	interface Serving {
		readonly request: (path: string, init?: RequestInit) => Promise<Response>;
		readonly pipelineFile: string;
	}

	async function serving(): Promise<Serving> {
		const cases = await temporaryDirectory("rehearse-step-cases-");
		for (const declaration of [PIPELINE_CASE, SESSION_CASE]) {
			await mkdir(join(cases, declaration.id), { recursive: true });
			await Bun.write(
				join(cases, declaration.id, "case.json"),
				JSON.stringify(declaration),
			);
		}
		const pipelineFile = join(cases, "pipe-case", "pipeline.json");
		await Bun.write(pipelineFile, JSON.stringify(PIPELINE));
		for (const rubric of ["shape.json", "build.json"]) {
			await Bun.write(
				join(cases, "pipe-case", "rubrics", rubric),
				await Bun.file(
					join(CONTROL_DIR, "cases/audit-log/rubrics", rubric),
				).text(),
			);
		}
		const runsDirectory = await temporaryDirectory("rehearse-step-runs-");
		const app = createLaunchApp({
			runsDirectory,
			casesRoot: cases,
			launcher: new FakeLauncher(),
			liveness: NOTHING_RUNNING,
			liveCorpus: () => directoryLiveCorpus(runsDirectory),
			home: runsDirectory,
		});

		return {
			request: (path, init) => Promise.resolve(app.request(path, init)),
			pipelineFile,
		};
	}

	function putSteps(
		{ request }: Serving,
		caseId: string,
		stages: readonly object[],
	): Promise<Response> {
		return request(`/api/cases/${caseId}/steps`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ stages }),
		});
	}

	it("answers a pipeline case's declared steps and the rubrics a step may name", async () => {
		const server = await serving();

		const response = await server.request("/api/cases/pipe-case/steps");

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			caseId: "pipe-case",
			pipeline: "cases/pipe-case/pipeline.json",
			stages: PIPELINE.stages,
			rubrics: [DELIVERY_RUBRIC, PLANNING_RUBRIC],
		});
	});

	it("writes the edited steps into the case's pipeline, keeping the rest of the file", async () => {
		const server = await serving();
		const stages = [
			{
				name: "build",
				kind: "delivery",
				skill: "deliver",
				rubric: DELIVERY_RUBRIC,
			},
		];

		const response = await putSteps(server, "pipe-case", stages);

		expect(response.status).toBe(200);
		expect(await Bun.file(server.pipelineFile).json()).toEqual({
			...PIPELINE,
			stages,
		});
		const read = await server.request("/api/cases/pipe-case/steps");
		expect(await read.json()).toMatchObject({ stages });
	});

	it("writes the file as the project's formatter would, so the edit is the only diff", async () => {
		const server = await serving();

		await putSteps(server, "pipe-case", PIPELINE.stages);

		const written = await Bun.file(server.pipelineFile).text();
		expect(written).toContain('\t"statuses": ["To Do", "Done"],\n');
		expect(written).toContain(
			'\t\t"checks": [\n\t\t\t{\n\t\t\t\t"command": ["bun", "run", "typecheck"]\n\t\t\t}\n\t\t],\n',
		);
		const formatted = await format(
			"pipeline.json",
			written,
			z
				.looseObject({})
				.parse(await Bun.file(join(CONTROL_DIR, ".oxfmtrc.json")).json()),
		);
		expect(formatted.code).toBe(written);
	});

	it.each([
		{
			refusing: "a rubric outside the case's rubrics",
			stages: [
				{
					name: "build",
					kind: "delivery",
					skill: "build",
					rubric: "cases/pipe-case/rubrics/missing.json",
				},
			],
		},
		{
			refusing: "a rubric that does not fit the step's kind",
			stages: [
				{
					name: "build",
					kind: "delivery",
					skill: "build",
					rubric: PLANNING_RUBRIC,
				},
			],
		},
		{
			refusing: "a skill name that is not a plain identifier",
			stages: [
				{
					name: "build",
					kind: "delivery",
					skill: "../build",
					rubric: DELIVERY_RUBRIC,
				},
			],
		},
		{ refusing: "no step at all", stages: [] },
	])("refuses $refusing and leaves the file as it was", async ({ stages }) => {
		const server = await serving();
		const before = await Bun.file(server.pipelineFile).text();

		const response = await putSteps(server, "pipe-case", stages);

		expect(response.status).toBe(400);
		const refused = z
			.object({ error: z.string().min(1) })
			.safeParse(await response.json());
		expect(refused.success).toBe(true);
		expect(await Bun.file(server.pipelineFile).text()).toBe(before);
	});

	it("answers 409 and writes nothing while the case's pipeline file is one the harness refuses", async () => {
		const server = await serving();
		await Bun.write(server.pipelineFile, "{ not json");

		const read = await server.request("/api/cases/pipe-case/steps");
		const edit = await putSteps(server, "pipe-case", PIPELINE.stages);

		expect(read.status).toBe(409);
		expect(edit.status).toBe(409);
		expect(await Bun.file(server.pipelineFile).text()).toBe("{ not json");
	});

	it.each(["sess-case", "no-such-case"])(
		"answers 404 for %s, which declares no pipeline",
		async (caseId) => {
			const server = await serving();

			const read = await server.request(`/api/cases/${caseId}/steps`);
			const edit = await putSteps(server, caseId, PIPELINE.stages);

			expect(read.status).toBe(404);
			expect(edit.status).toBe(404);
		},
	);
});
