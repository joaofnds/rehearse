import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	RecordedRunsFixture,
	directorySource,
} from "#benchmark/run-records-test-support";
import ApiTestHarness from "#server/api-test-harness";

const RESOURCE_DRAIN_START_INDEX = 0;

const systems: ApiTestHarness[] = [];

async function startHistoryApi(
	runsDirectory: string,
): Promise<ApiTestHarness["driver"]> {
	const system = await ApiTestHarness.setup({
		runsDirectory,
		source: directorySource(runsDirectory),
	});
	systems.push(system);

	return system.driver;
}

const roots: string[] = [];

interface StageRecordFixture {
	readonly runsDirectory: string;
	readonly run: string;
	readonly stage: string;
}

async function writtenAwaitingJudgeRun(): Promise<StageRecordFixture> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-awaiting-reader-"));
	roots.push(root);
	const runsDirectory = join(root, ".benchmark-runs");
	const fixture = new RecordedRunsFixture(runsDirectory);
	await fixture.stopped.writeAwaitingJudgeRun();

	return { run: fixture.awaitingJudgeRun, runsDirectory, stage: "build" };
}

async function writtenStoppedRun(): Promise<StageRecordFixture> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-stopped-reader-"));
	roots.push(root);
	const runsDirectory = join(root, ".benchmark-runs");
	const fixture = new RecordedRunsFixture(runsDirectory);
	await fixture.stopped.writeStoppedRun();

	return { run: fixture.stoppedRun, runsDirectory, stage: "build" };
}

async function clearSessionHistoryRoots(): Promise<void> {
	await Promise.all(
		systems.splice(RESOURCE_DRAIN_START_INDEX).map(async (system) => {
			await system.teardown();
		}),
	);
	await Promise.all(
		roots.splice(RESOURCE_DRAIN_START_INDEX).map(async (root) => {
			await rm(root, { force: true, recursive: true });
		}),
	);
}

async function historyRunsDirectory(prefix: string): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), prefix));
	roots.push(root);

	return join(root, ".benchmark-runs");
}

export {
	historyRunsDirectory,
	roots,
	startHistoryApi,
	writtenAwaitingJudgeRun,
	writtenStoppedRun,
	clearSessionHistoryRoots,
};
