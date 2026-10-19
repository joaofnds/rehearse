import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { z } from "zod";

import { CONTROL_DIR } from "#benchmark/config";
import { recordGroup, recordRun } from "#server/pipeline-records-test-fixture";
import type {
	RecordedGroup,
	RecordedRun,
} from "#server/pipeline-records-test-fixture";

import CaseCatalogExamples from "./case-catalog-test-examples";
import {
	FAKE_LAUNCH_TIME,
	FakeLauncher,
	directoryLiveCorpus,
} from "./launch-test-support";
import type { LaunchDependencies } from "./launches";
import createLaunchApp from "./launches";
import PipelineDefinitionBuilder from "./pipeline-definition-test-builder";

const RESOURCE_DRAIN_START_INDEX = 0;

const NOTHING_RUNNING: LaunchDependencies["liveness"] = {
	isAlive: () => false,
	readMarker: async () => {
		await Promise.try((): undefined => undefined);
	},
};

const DECLARED_PIPELINE = "cases/pipe-case/pipeline.json";

const OVERRIDE_PIPELINE = "cases/pipe-case/override.json";

const { pipeline: PIPELINE_CASE, session: SESSION_CASE } =
	CaseCatalogExamples.declarations();

const listedPipelineSchema = z
	.object({
		cases: z.array(z.string()),
		figures: z.object({
			corpusVersion: z.string().nullable(),
			counted: z.number(),
			leftOut: z.number(),
		}),
		path: z.string(),
		runs: z.array(z.string()),
		stages: z.array(z.string()),
	})
	.loose();

const unreadablePipelineSchema = z.object({
	id: z.string(),
	reason: z.string(),
});

const pipelinesResponseSchema = z.object({
	pipelines: z.array(listedPipelineSchema),
	unreadable: z.array(unreadablePipelineSchema),
});

type PipelinesResponse = z.infer<typeof pipelinesResponseSchema>;

const roots: string[] = [];

async function temporaryDirectory(prefix: string): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), prefix));
	roots.push(root);

	return root;
}

async function casesRoot(
	declarations: readonly { readonly id: string }[],
): Promise<string> {
	const root = await temporaryDirectory("rehearse-pipeline-cases-");
	await Array.fromAsync(declarations, async (declaration) => {
		await mkdir(join(root, declaration.id), { recursive: true });
		await Bun.write(
			join(root, declaration.id, "case.json"),
			JSON.stringify(declaration),
		);
	});
	await Bun.write(
		join(root, "pipe-case", "pipeline.json"),
		JSON.stringify(
			new PipelineDefinitionBuilder()
				.withStageNames(["discuss", "build"])
				.build(),
		),
	);
	await Array.fromAsync(
		[
			["discuss", "shape.json"],
			["build", "build.json"],
		] as const,
		async ([stage, fitting]) => {
			await Bun.write(
				join(root, "pipe-case", "rubrics", `${stage}.json`),
				await Bun.file(
					join(CONTROL_DIR, "cases/audit-log/rubrics", fitting),
				).text(),
			);
		},
	);

	return root;
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
	await Array.fromAsync(runs, async (run) => {
		names.push(await recordRun(runsDirectory, run));
	});
	await Array.fromAsync(groups, async (group) => {
		await recordGroup(runsDirectory, group);
	});
	const cases = await casesRoot([PIPELINE_CASE, SESSION_CASE]);
	const app = createLaunchApp({
		casesRoot: cases,
		home: runsDirectory,
		launcher: new FakeLauncher(),
		liveCorpus: () => directoryLiveCorpus(runsDirectory),
		liveness: NOTHING_RUNNING,
		now: () => new Date(FAKE_LAUNCH_TIME),
		runsDirectory,
	});
	const get = async (): Promise<Response> =>
		await Promise.resolve(app.request("/api/pipelines"));

	return {
		cases,
		get,
		list: async () => {
			const response = await get();

			return pipelinesResponseSchema.parse(await response.json());
		},
		names,
		runsDirectory,
	};
}

async function clearPipelineRoots(): Promise<void> {
	await Promise.all(
		roots.splice(RESOURCE_DRAIN_START_INDEX).map(async (root) => {
			await rm(root, { force: true, recursive: true });
		}),
	);
}

export {
	SESSION_CASE,
	DECLARED_PIPELINE,
	OVERRIDE_PIPELINE,
	serving,
	clearPipelineRoots,
};
