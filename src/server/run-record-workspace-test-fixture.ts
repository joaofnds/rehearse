import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { RunLiveness } from "#benchmark/run-liveness";
import {
	NO_PROVIDER_PROJECTS,
	RecordedRunsFixture,
	directorySource,
	fixedCorpusSource,
	nothingRunning,
} from "#benchmark/run-records-test-support";

import createApiApp from "./api";

const RESOURCE_DRAIN_START_INDEX = 0;

async function runRecord(
	fixture: RecordedRunsFixture,
	run: string,
	liveness: RunLiveness = nothingRunning,
): Promise<Response> {
	const app = createApiApp({
		liveness,
		projectsDirectory: NO_PROVIDER_PROJECTS,
		readCorpusSource: fixedCorpusSource(directorySource(fixture.runsDirectory)),
		runsDirectory: fixture.runsDirectory,
	});

	return await app.request(`/api/runs/${encodeURIComponent(run)}`);
}

const roots: string[] = [];

async function emptyFixture(): Promise<RecordedRunsFixture> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-run-record-"));
	roots.push(root);

	return new RecordedRunsFixture(root);
}

async function clearRunRecordRoots(): Promise<void> {
	await Promise.all(
		roots.splice(RESOURCE_DRAIN_START_INDEX).map(async (root) => {
			await rm(root, { force: true, recursive: true });
		}),
	);
}

export { emptyFixture, runRecord, clearRunRecordRoots };
