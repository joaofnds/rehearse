import { z } from "zod";
import type { Immutable } from "#benchmark/contracts";
import { loadRunManifest } from "#benchmark/manifest";
import { benchmarkRunPaths } from "#benchmark/run-layout";
import type { BenchmarkRunPaths } from "#benchmark/run-layout";

export type Reading<Value> =
	| ({ readonly state: "available" } & Value)
	| { readonly state: "unavailable"; readonly reasons: readonly string[] };

export interface RunRecordStage {
	readonly stage: string;
	readonly sessionCost: Reading<{ readonly usd: number }>;
	readonly judgeCost: Reading<{ readonly usd: number }>;
}

export interface RunRecord {
	readonly run: string;
	readonly stages: readonly RunRecordStage[];
}

const stageFileSchema = z
	.object({
		costUsd: z.number().optional(),
		input: z
			.object({
				transcript: z
					.object({ costUsd: z.number().optional() })
					.loose()
					.optional(),
			})
			.loose()
			.optional(),
	})
	.loose();

type StageFile = Immutable<z.infer<typeof stageFileSchema>>;

function usd(
	amount: number | undefined,
	missing: string,
): Reading<{ readonly usd: number }> {
	if (amount === undefined) {
		return { state: "unavailable", reasons: [missing] };
	}

	return { state: "available", usd: amount };
}

async function readStageFile(
	paths: BenchmarkRunPaths,
	stage: string,
): Promise<StageFile | undefined> {
	const file = Bun.file(paths.stageFile(stage));
	if (!(await file.exists())) {
		return undefined;
	}

	return stageFileSchema.parse(JSON.parse(await file.text()));
}

function stageRecord(
	stage: string,
	file: StageFile | undefined,
): RunRecordStage {
	return {
		stage,
		sessionCost: usd(
			file?.input?.transcript?.costUsd,
			"the stage record holds no session cost",
		),
		judgeCost: usd(file?.costUsd, "the stage record holds no judge cost"),
	};
}

/**
 * One pipeline run projected across the files it wrote: its manifest for the
 * stage order, each stage's own record, its checkpoints, and its main
 * artifact when it finished. `/api/records/:id` serves one of those files
 * whole; this reads all of them into the figures a run's page shows.
 */
export async function readRunRecord(
	runsDirectory: string,
	run: string,
): Promise<RunRecord> {
	const paths = benchmarkRunPaths(runsDirectory, run);
	const manifest = await loadRunManifest(paths.manifestFile);
	const stages: RunRecordStage[] = [];
	for (const { name } of manifest.pipeline.stages) {
		stages.push(stageRecord(name, await readStageFile(paths, name)));
	}

	return { run, stages };
}
