import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CONTROL_DIR } from "#benchmark/config";
import type { PipelineDefinition } from "#benchmark/pipeline";
import type { RunLiveness } from "#benchmark/run-liveness";

import CaseCatalogExamples from "./case-catalog-test-examples";
import {
	FAKE_LAUNCH_TIME,
	FakeLauncher,
	directoryLiveCorpus,
} from "./launch-test-support";
import createLaunchApp from "./launches";

const RESOURCE_DRAIN_START_INDEX = 0;

interface Serving {
	readonly request: (path: string, init?: RequestInit) => Promise<Response>;
	readonly pipelineFile: string;
}

async function putSteps(
	{ request }: Serving,
	caseId: string,
	stages: readonly object[],
): Promise<Response> {
	return await request(`/api/cases/${caseId}/steps`, {
		body: JSON.stringify({ stages }),
		headers: { "content-type": "application/json" },
		method: "PUT",
	});
}

const NOTHING_RUNNING: RunLiveness = {
	isAlive: () => false,
	readMarker: async () => {
		await Promise.try((): undefined => undefined);
	},
};

const { pipeline: PIPELINE_CASE, session: SESSION_CASE } =
	CaseCatalogExamples.declarations();

const PLANNING_RUBRIC = "cases/pipe-case/rubrics/shape.json";

const DELIVERY_RUBRIC = "cases/pipe-case/rubrics/build.json";

const PIPELINE: PipelineDefinition = {
	stages: [
		{
			kind: "planning",
			name: "shape",
			requiresAcceptanceCriteria: true,
			rubric: PLANNING_RUBRIC,
			skill: "shape",
		},
		{
			kind: "delivery",
			name: "build",
			rubric: DELIVERY_RUBRIC,
			skill: "build",
		},
	],
	statuses: ["To Do", "Done"],
	target: {
		checks: [{ command: ["bun", "run", "typecheck"] }],
		integrityFiles: ["package.json"],
	},
};

const roots: string[] = [];

async function temporaryDirectory(prefix: string): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), prefix));
	roots.push(root);

	return root;
}

async function serving(): Promise<Serving> {
	const cases = await temporaryDirectory("rehearse-step-cases-");
	await Array.fromAsync([PIPELINE_CASE, SESSION_CASE], async (declaration) => {
		await mkdir(join(cases, declaration.id), { recursive: true });
		await Bun.write(
			join(cases, declaration.id, "case.json"),
			JSON.stringify(declaration),
		);
	});
	const pipelineFile = join(cases, "pipe-case", "pipeline.json");
	await Bun.write(pipelineFile, JSON.stringify(PIPELINE));
	await Array.fromAsync(["shape.json", "build.json"], async (rubric) => {
		await Bun.write(
			join(cases, "pipe-case", "rubrics", rubric),
			await Bun.file(
				join(CONTROL_DIR, "cases/audit-log/rubrics", rubric),
			).text(),
		);
	});
	const runsDirectory = await temporaryDirectory("rehearse-step-runs-");
	const app = createLaunchApp({
		casesRoot: cases,
		home: runsDirectory,
		launcher: new FakeLauncher(),
		liveCorpus: () => directoryLiveCorpus(runsDirectory),
		liveness: NOTHING_RUNNING,
		now: () => new Date(FAKE_LAUNCH_TIME),
		runsDirectory,
	});

	return {
		pipelineFile,
		request: async (path, init) =>
			await Promise.resolve(app.request(path, init)),
	};
}

async function clearStepRoots(): Promise<void> {
	await Promise.all(
		roots.splice(RESOURCE_DRAIN_START_INDEX).map(async (root) => {
			await rm(root, { force: true, recursive: true });
		}),
	);
}

export {
	putSteps,
	PLANNING_RUBRIC,
	DELIVERY_RUBRIC,
	PIPELINE,
	serving,
	clearStepRoots,
};
