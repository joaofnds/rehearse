import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { z } from "zod";

import { openRunEventStore } from "#benchmark/run-events";
import { runEventsDatabaseFile } from "#benchmark/run-layout";
import type { RunLiveness } from "#benchmark/run-liveness";
import {
	NO_PROVIDER_PROJECTS,
	RUNNING_RUN,
	RecordedRunsFixture,
	claimBy,
	directorySource,
	fixedCorpusSource,
	nothingRunning,
} from "#benchmark/run-records-test-support";

import createApiApp from "./api";

const RUN_OWNER_PID = 1;

const RESOURCE_DRAIN_START_INDEX = 0;

/**
 * Only the fields a test finds a row by: the rest of the row is what each
 * test asserts, against the served JSON as it arrived.
 */
const runHistoryRowSchema = z.looseObject({
	kind: z.string(),
	run: z.string().optional(),
});

const runHistorySchema = z.object({
	rows: z.array(runHistoryRowSchema),
});

type ListedRow = z.infer<typeof runHistorySchema>["rows"][number];

const liveRun: RunLiveness = {
	isAlive: () => true,
	readMarker: async () =>
		await Promise.resolve(claimBy(RUNNING_RUN, RUN_OWNER_PID)),
};

const FINISHED_RUN = "2026-09-11T00-00-00.000Z";

/**
 * The event reconciliation appends for a run no live process holds. Run
 * history lists a run whose last event is not terminal only while it runs,
 * so a run that died awaiting judgment is listed once this is recorded.
 */
async function reconciledAsInterrupted(
	fixture: RecordedRunsFixture,
	run: string,
	stage = "build",
): Promise<void> {
	const store = await openRunEventStore(
		runEventsDatabaseFile(fixture.runsDirectory),
	);
	store.append({
		elapsedMs: 5000,
		kind: "run-interrupted",
		runId: run,
		spentUsd: 1,
		stage,
	});
	store.close();
}

const roots: string[] = [];

async function emptyFixture(): Promise<RecordedRunsFixture> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-run-figures-"));
	roots.push(root);

	return new RecordedRunsFixture(root);
}

async function rows(
	fixture: RecordedRunsFixture,
	liveness: RunLiveness = nothingRunning,
): Promise<readonly ListedRow[]> {
	const app = createApiApp({
		liveness,
		projectsDirectory: NO_PROVIDER_PROJECTS,
		readCorpusSource: fixedCorpusSource(directorySource(fixture.runsDirectory)),
		runsDirectory: fixture.runsDirectory,
	});

	const response = await app.request("/api/runs");

	return runHistorySchema.parse(await response.json()).rows;
}

async function runRow(
	fixture: RecordedRunsFixture,
	run: string,
	liveness: RunLiveness = nothingRunning,
): Promise<ListedRow | undefined> {
	const listed = await rows(fixture, liveness);

	return listed.find((row) => row.kind === "run" && row.run === run);
}

async function onlyRowOfKind(
	fixture: RecordedRunsFixture,
	kind: string,
): Promise<ListedRow | undefined> {
	const listed = await rows(fixture);

	return listed.find((row) => row.kind === kind);
}

async function clearFigureRoots(): Promise<void> {
	await Promise.all(
		roots.splice(RESOURCE_DRAIN_START_INDEX).map(async (root) => {
			await rm(root, { force: true, recursive: true });
		}),
	);
}

export {
	emptyFixture,
	rows,
	runRow,
	onlyRowOfKind,
	clearFigureRoots,
	liveRun,
	FINISHED_RUN,
	reconciledAsInterrupted,
};

export type { ListedRow };
