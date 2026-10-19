import { afterEach, describe, expect, it } from "bun:test";
import { join } from "node:path";

import {
	RecordedRunsFixture,
	directorySource,
} from "./run-records-test-support";
import ConfirmationCorpusFixtures from "./staleness-group-test-fixtures";
import { deliveryRead } from "./staleness-loaded-file-test-fixtures";
import { groupStaleness } from "./staleness-report";
import { sha256Of } from "./staleness-test-files";

const fixtures = new ConfirmationCorpusFixtures();

afterEach(async () => {
	await fixtures.cleanup();
});

async function stalesASessionGroupWhoseRepLoadedAFileBeyondTheFrozenCorpusThatChanged(): Promise<void> {
	const corpus = await fixtures.sessionStyleCorpus("delivery\n");
	const fixture = new RecordedRunsFixture(
		await fixtures.temporaryDirectory("rehearse-session-group-"),
	);
	await fixture.confirmations.corpus.recordSessionGroupFrom({
		corpusRoot: corpus,
		groupId: "session-group",
		layoutPaths: ["output-styles/brief.md"],
	});
	await fixture.confirmations.reads.recordSessionGroupRepAttempt(
		{ groupId: "session-group", repId: "session-group-rep-1" },
		{
			corpusRoot: corpus,
			layoutPaths: ["output-styles/brief.md"],
			readManifest: [deliveryRead("delivery\n")],
		},
	);
	await Bun.write(join(corpus, "skills", "delivery", "SKILL.md"), "edited\n");

	const report = await groupStaleness(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(report.records).toEqual([
		expect.objectContaining({
			causes: ["skills/delivery/SKILL.md changed"],
			readManifest: [
				expect.objectContaining({
					path: "skills/delivery/SKILL.md",
					state: "changed",
				}),
			],
			stale: true,
		}),
	]);
}

async function keepsAdditionalSessionReadsSeparateBetweenGroupsOfTheSameCase(): Promise<void> {
	const corpus = await fixtures.sharedCaseCorpus();
	const fixture = await fixtures.matchingSessionGroups(corpus, [
		"output-styles/brief.md",
	]);
	await fixture.confirmations.reads.recordSessionGroupRepAttempt(
		{ groupId: "a-group", repId: "a-group-rep-1" },
		{
			corpusRoot: corpus,
			layoutPaths: ["output-styles/brief.md"],
			readManifest: [deliveryRead("delivery\n")],
		},
	);
	await Bun.write(join(corpus, "skills/delivery/SKILL.md"), "edited\n");

	const report = await groupStaleness(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(report.records).toEqual([
		expect.objectContaining({
			changedFiles: [{ change: "changed", path: "skills/delivery/SKILL.md" }],
			id: "group:a-group",
			readFiles: [
				{ path: "output-styles/brief.md", sha256: sha256Of("brief\n") },
				{ path: "skills/delivery/SKILL.md", sha256: sha256Of("delivery\n") },
			],
			stale: true,
		}),
		expect.objectContaining({
			changedFiles: [],
			id: "group:z-group",
			readFiles: [
				{ path: "output-styles/brief.md", sha256: sha256Of("brief\n") },
			],
			stale: false,
		}),
	]);
	expect(report.unreadable).toEqual([]);
}

async function rereadsTheSharedSessionCorpusInALaterReport(): Promise<void> {
	const corpus = await fixtures.temporaryDirectory(
		"rehearse-group-current-case-",
	);
	await Bun.write(join(corpus, "output-styles/brief.md"), "brief\n");
	const fixture = await fixtures.matchingSessionGroups(corpus, [
		"output-styles/brief.md",
	]);

	await groupStaleness(fixture.runsDirectory, directorySource(corpus));
	await Bun.write(join(corpus, "output-styles/brief.md"), "edited\n");

	const report = await groupStaleness(
		fixture.runsDirectory,
		directorySource(corpus),
	);

	expect(report.records).toEqual([
		expect.objectContaining({
			changedFiles: [{ change: "changed", path: "output-styles/brief.md" }],
			id: "group:a-group",
			stale: true,
		}),
		expect.objectContaining({
			changedFiles: [{ change: "changed", path: "output-styles/brief.md" }],
			id: "group:z-group",
			stale: true,
		}),
	]);
	expect(report.unreadable).toEqual([]);
}

describe(groupStaleness.name, () => {
	it(
		"stales a session group whose rep loaded a file beyond the frozen corpus that changed",
		stalesASessionGroupWhoseRepLoadedAFileBeyondTheFrozenCorpusThatChanged,
	);
	it(
		"keeps additional session reads separate between groups of the same case",
		keepsAdditionalSessionReadsSeparateBetweenGroupsOfTheSameCase,
	);
	it(
		"rereads the shared session corpus in a later report",
		rereadsTheSharedSessionCorpusInALaterReport,
	);
});
