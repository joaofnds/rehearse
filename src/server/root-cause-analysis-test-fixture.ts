import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runStoppedAtBuild } from "#benchmark/root-cause-analysis-test-support";
import {
	NO_PROVIDER_PROJECTS,
	directorySource,
	fixedCorpusSource,
	nothingRunning,
} from "#benchmark/run-records-test-support";

import createApiApp from "./api";

const RESOURCE_DRAIN_START_INDEX = 0;

async function analysesOf(directory: string, run: string): Promise<Response> {
	const app = createApiApp({
		liveness: nothingRunning,
		projectsDirectory: NO_PROVIDER_PROJECTS,
		readCorpusSource: fixedCorpusSource(directorySource(directory)),
		runsDirectory: directory,
	});

	return await Promise.resolve(app.request(`/api/runs/${run}/analyses`));
}

const roots: string[] = [];

async function recordedRun(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "rehearse-analyses-"));
	roots.push(directory);
	await runStoppedAtBuild(directory);

	return directory;
}

async function clearAnalysisRoots(): Promise<void> {
	await Promise.all(
		roots.splice(RESOURCE_DRAIN_START_INDEX).map(async (root) => {
			await rm(root, { force: true, recursive: true });
		}),
	);
}

export { analysesOf, recordedRun, clearAnalysisRoots };
