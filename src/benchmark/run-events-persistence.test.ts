import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { openRunEventStore } from "./run-events";
import RunEventResources from "./run-events-test-resources";

const resources = RunEventResources.forEachTest();

async function opensAFileBackedDatabaseInWALModePerDecision3(): Promise<void> {
	const directory = await resources.directory();

	const store = resources.own(
		await openRunEventStore(join(directory, "events.sqlite")),
	);

	expect(store.journalMode()).toBe("wal");
	store.close();
}

async function createsADatabaseFileSParentDirectoryWhenItDoesNotExistYetSinceTheRunsDirectoryIsNeverCreatedAheadOfTheFirstRun(): Promise<void> {
	const parent = await resources.directory();
	const path = join(parent, "not-yet-created", "events.sqlite");

	const store = resources.own(await openRunEventStore(path));

	expect(await Bun.file(path).exists()).toBe(true);
	store.close();
}

describe(openRunEventStore.name, () => {
	describe("when opening a file-backed event database", () => {
		it(
			"opens a file-backed database in WAL mode, per decision-3",
			opensAFileBackedDatabaseInWALModePerDecision3,
		);
		it(
			"creates a database file's parent directory when it does not exist yet, since the runs directory is never created ahead of the first run",
			createsADatabaseFileSParentDirectoryWhenItDoesNotExistYetSinceTheRunsDirectoryIsNeverCreatedAheadOfTheFirstRun,
		);
	});
});
