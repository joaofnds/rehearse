import { describe, expect, it } from "bun:test";
import { symlink } from "node:fs/promises";
import { join } from "node:path";

import { listRecords } from "#cli/list-command";
import { runListing } from "#server/run-history";

import {
	archiveConfirmation,
	listConfirmationArchives,
	restoreConfirmation,
} from "./confirmation-archive";
import {
	ConfirmationArchiveFixture,
	GROUP,
	WHEN,
} from "./confirmation-archive-test-fixtures";
import { confirmationGroupPaths } from "./run-layout";
import {
	RecordedRunsFixture,
	nothingRunning,
} from "./run-records-test-support";

const SINGLE_REP_COUNT = 1;

const fixtures = ConfirmationArchiveFixture.forEachTest();

async function showsALaterValidSummaryNormallyDespiteExistingArchiveMetadata(): Promise<void> {
	const root = await fixtures.records();
	await archiveConfirmation({
		archivedAt: WHEN,
		groupId: GROUP,
		runsDirectory: root,
	});
	const fixture = new RecordedRunsFixture(root);
	await fixture.confirmations.records.writeSessionGroup(
		GROUP,
		SINGLE_REP_COUNT,
	);

	const cli = await listRecords("groups", root);
	const history = await runListing(root, nothingRunning);

	expect(cli.entries.map(({ id }) => id)).toContain(`group:${GROUP}`);
	expect(history.rows.map(({ recordId }) => recordId)).toContain(
		`group:${GROUP}`,
	);
	expect(await listConfirmationArchives(root)).toEqual({
		archived: [],
		unreadable: [],
	});
}

async function showsALaterMalformedSummaryInsteadOfConcealingItAsArchived(): Promise<void> {
	const root = await fixtures.records();
	await archiveConfirmation({
		archivedAt: WHEN,
		groupId: GROUP,
		runsDirectory: root,
	});
	await Bun.write(confirmationGroupPaths(root, GROUP).groupFile, "not json");

	const cli = await listRecords("groups", root);
	const history = await runListing(root, nothingRunning);

	expect(cli.unreadable.map(({ id }) => id)).toContain(`group:${GROUP}`);
	expect(history.unreadable.map(({ id }) => id)).toContain(`group:${GROUP}`);
	expect(
		history.unreadable.find(({ id }) => id === `group:${GROUP}`)
			?.incompleteConfirmation,
	).toBeUndefined();
	expect(await listConfirmationArchives(root)).toEqual({
		archived: [],
		unreadable: [],
	});
}

async function givesASavedSummaryPrecedenceEvenOverCorruptArchiveMetadata(): Promise<void> {
	const root = await fixtures.records();
	await Bun.write(
		join(root, "confirmation-archives", `${GROUP}.json`),
		"broken metadata",
	);
	const fixture = new RecordedRunsFixture(root);
	await fixture.confirmations.records.writeSessionGroup(
		GROUP,
		SINGLE_REP_COUNT,
	);

	const cli = await listRecords("groups", root);
	const history = await runListing(root, nothingRunning);

	expect(cli.entries.map(({ id }) => id)).toContain(`group:${GROUP}`);
	expect(history.rows.map(({ recordId }) => recordId)).toContain(
		`group:${GROUP}`,
	);
	expect(await listConfirmationArchives(root)).toEqual({
		archived: [],
		unreadable: [],
	});
}

async function reportsAnUnreadableExistingSummarySymlinkInsteadOfSuppressingTheGroup(): Promise<void> {
	const root = await fixtures.records();
	await archiveConfirmation({
		archivedAt: WHEN,
		groupId: GROUP,
		runsDirectory: root,
	});
	await symlink(
		join(root, "absent-summary"),
		confirmationGroupPaths(root, GROUP).groupFile,
	);

	const cli = await listRecords("groups", root);
	const history = await runListing(root, nothingRunning);

	expect(cli.unreadable.map(({ id }) => id)).toContain(`group:${GROUP}`);
	expect(history.unreadable.map(({ id }) => id)).toContain(`group:${GROUP}`);
	expect(
		history.unreadable.find(({ id }) => id === `group:${GROUP}`)
			?.incompleteConfirmation,
	).toBeUndefined();
	expect(await listConfirmationArchives(root)).toEqual({
		archived: [],
		unreadable: [],
	});
}

async function removesTheArchivedGroupSActionableRunsWarningAndReturnsItOnRestore(): Promise<void> {
	const root = await fixtures.records();
	await new RecordedRunsFixture(root).confirmations.records.writeSessionGroup(
		"neighbor",
		SINGLE_REP_COUNT,
	);
	const before = await runListing(root, nothingRunning);
	expect(before.unreadable).toEqual([
		{
			id: `group:${GROUP}`,
			incompleteConfirmation: { groupId: GROUP },
			kind: "group",
			reason: "incomplete: no group.json recorded",
		},
	]);

	await archiveConfirmation({
		archivedAt: WHEN,
		groupId: GROUP,
		runsDirectory: root,
	});

	const archived = await runListing(root, nothingRunning);
	expect(archived.unreadable).toEqual([]);
	expect(archived.rows.map(({ recordId }) => recordId)).toEqual([
		"group:neighbor",
	]);
}
async function returnsTheWarningWhenAnArchivedGroupIsRestored(): Promise<void> {
	const root = await fixtures.records();
	await new RecordedRunsFixture(root).confirmations.records.writeSessionGroup(
		"neighbor",
		SINGLE_REP_COUNT,
	);
	const before = await runListing(root, nothingRunning);
	await archiveConfirmation({
		archivedAt: WHEN,
		groupId: GROUP,
		runsDirectory: root,
	});

	await restoreConfirmation({ groupId: GROUP, runsDirectory: root });
	const restored = await runListing(root, nothingRunning);
	expect(restored.unreadable).toEqual(before.unreadable);
	expect(restored.rows.map(({ recordId }) => recordId)).toEqual([
		"group:neighbor",
	]);
}

describe("incomplete confirmation archive", () => {
	it(
		"removes the archived group's actionable Runs warning and returns it on restore",
		removesTheArchivedGroupSActionableRunsWarningAndReturnsItOnRestore,
	);

	it(
		"returns the warning when an archived group is restored",
		returnsTheWarningWhenAnArchivedGroupIsRestored,
	);
	it(
		"shows a later valid summary normally despite existing archive metadata",
		showsALaterValidSummaryNormallyDespiteExistingArchiveMetadata,
	);
	it(
		"shows a later malformed summary instead of concealing it as archived",
		showsALaterMalformedSummaryInsteadOfConcealingItAsArchived,
	);
	it(
		"gives a saved summary precedence even over corrupt archive metadata",
		givesASavedSummaryPrecedenceEvenOverCorruptArchiveMetadata,
	);
	it(
		"reports an unreadable existing summary symlink instead of suppressing the group",
		reportsAnUnreadableExistingSummarySymlinkInsteadOfSuppressingTheGroup,
	);
});
