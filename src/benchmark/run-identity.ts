import { mkdir } from "node:fs/promises";

import type { BenchmarkConfig } from "./config";
import { recordsDirectory } from "./config";
import type { BenchmarkRunPaths } from "./run-layout";
import { benchmarkRunPaths, runNameFromTimestamp } from "./run-layout";
import { assertControlReady, assertSourceReady } from "./target";
import type { SourceBaseline } from "./target";

interface RunIdentity {
	readonly controlSha: string;
	readonly target: SourceBaseline;
	readonly timestamp: string;
	readonly files: BenchmarkRunPaths;
}
async function createRunFiles(timestamp: string): Promise<BenchmarkRunPaths> {
	const directory = recordsDirectory();
	await mkdir(directory, { recursive: true });
	return benchmarkRunPaths(directory, runNameFromTimestamp(timestamp));
}
async function prepareRunIdentity(
	config: BenchmarkConfig,
): Promise<RunIdentity> {
	const controlSha = await assertControlReady();
	const target = await assertSourceReady(config.sourceDir);
	const timestamp = new Date().toISOString();
	const files = await createRunFiles(timestamp);
	return { controlSha, files, target, timestamp };
}
export { prepareRunIdentity as default };
export type { RunIdentity };
