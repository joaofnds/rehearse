import { afterEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { confirmationGroupPaths } from "./run-layout";
import {
	RecordedRunsFixture,
	directorySource,
} from "./run-records-test-support";
import ConfirmationCorpusFixtures from "./staleness-group-test-fixtures";
import { groupStaleness } from "./staleness-report";

const fixtures = new ConfirmationCorpusFixtures();

async function namesEachFrozenSessionCorpusFileThatChanged(): Promise<void> {
	const corpus = await fixtures.temporaryDirectory("rehearse-group-style-");
	await mkdir(join(corpus, "output-styles"), { recursive: true });
	await Bun.write(join(corpus, "output-styles", "brief.md"), "brief\n");
	const fixture = new RecordedRunsFixture(
		await fixtures.temporaryDirectory("rehearse-session-group-"),
	);
	await fixture.confirmations.corpus.recordSessionGroupFrom({
		corpusRoot: corpus,
		groupId: "session-group",
		layoutPaths: ["output-styles/brief.md"],
	});
	await Bun.write(join(corpus, "output-styles", "brief.md"), "edited\n");

	const report = await groupStaleness(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(report.records).toEqual([
		expect.objectContaining({
			causes: ["output-styles/brief.md changed"],
			changedFiles: [{ change: "changed", path: "output-styles/brief.md" }],
			distance: { kind: "measured", versions: 1 },
			id: "group:session-group",
			onlyCorpusFiles: true,
			stale: true,
		}),
	]);
}

async function preservesGroupOrderAroundUnreadableAndMissingRecords(): Promise<void> {
	const corpus = await fixtures.briefCorpus("rehearse-group-ordered-corpus-");
	const fixture = await fixtures.fixtureForSessionCorpus([
		"output-styles/brief.md",
	]);
	await fixture.confirmations.corpus.recordSessionGroupFrom({
		corpusRoot: corpus,
		groupId: "z-group",
		layoutPaths: ["output-styles/brief.md"],
	});
	await fixture.confirmations.records.writeUnreadableGroup("y-broken");
	await mkdir(
		confirmationGroupPaths(fixture.runsDirectory, "c-missing").directory,
		{ recursive: true },
	);
	await fixture.confirmations.records.writeUnreadableGroup("b-broken");
	await fixture.confirmations.corpus.recordSessionGroupFrom({
		corpusRoot: corpus,
		groupId: "a-group",
		layoutPaths: ["output-styles/brief.md"],
	});

	const report = await groupStaleness(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(report.records.map(({ id }) => id)).toEqual([
		"group:a-group",
		"group:z-group",
	]);
	expect(report.unreadable.map(({ id }) => id)).toEqual([
		"group:b-broken",
		"group:y-broken",
	]);
}

afterEach(async () => {
	await fixtures.cleanup();
});

describe(groupStaleness.name, () => {
	it(
		"names each frozen session corpus file that changed",
		namesEachFrozenSessionCorpusFileThatChanged,
	);

	it(
		"preserves group order around unreadable and missing records",
		preservesGroupOrderAroundUnreadableAndMissingRecords,
	);
});
