import { describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

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
import { nothingRunning } from "./run-records-test-support";

const fixtures = ConfirmationArchiveFixture.forEachTest();

async function clearsInvalidRegularMetadataValueAndRestoresTheOrdinaryIncompleteAction(
	contents: string,
): Promise<void> {
	const root = await fixtures.records();
	await Bun.write(
		join(root, "confirmation-archives", `${GROUP}.json`),
		contents,
	);
	const before = await listConfirmationArchives(root);
	expect(before.unreadable.map(({ id, groupId }) => ({ groupId, id }))).toEqual(
		[{ groupId: GROUP, id: GROUP }],
	);

	await restoreConfirmation({ groupId: GROUP, runsDirectory: root });

	expect(await listConfirmationArchives(root)).toEqual({
		archived: [],
		unreadable: [],
	});
	const history = await runListing(root, nothingRunning);
	expect(history.unreadable).toContainEqual({
		id: `group:${GROUP}`,
		incompleteConfirmation: { groupId: GROUP },
		kind: "group",
		reason: "incomplete: no group.json recorded",
	});
	const savedInputPath = join(
		confirmationGroupPaths(root, GROUP).inputsDirectory,
		"input.txt",
	);
	expect(await Bun.file(savedInputPath).text()).toBe("unchanged input\n");
}

async function reportsInvalidMetadataInVersionIdentityAndTimestampOrder(): Promise<void> {
	const root = await fixtures.records();
	await Bun.write(
		join(root, "confirmation-archives", `${GROUP}.json`),
		JSON.stringify({
			archivedAt: "invalid",
			groupId: "../escape",
			schemaVersion: 9,
		}),
	);

	const archives = await listConfirmationArchives(root);
	const issueSchema = z.object({ path: z.array(z.string()) });
	const issuesSchema = z.array(issueSchema);
	const diagnosticPaths = archives.unreadable.flatMap(({ reason }) =>
		issuesSchema.parse(JSON.parse(reason)).map(({ path }) => path),
	);

	expect(diagnosticPaths).toEqual([
		["schemaVersion"],
		["groupId"],
		["archivedAt"],
	]);
}

async function isolatesInvalidMetadataValueWithoutSuppressingItsGroup(
	contents: string,
): Promise<void> {
	const root = await fixtures.records();
	await Bun.write(
		join(root, "confirmation-archives", `${GROUP}.json`),
		contents,
	);
	await mkdir(confirmationGroupPaths(root, "good-archive").directory);
	await archiveConfirmation({
		archivedAt: WHEN,
		groupId: "good-archive",
		runsDirectory: root,
	});

	const archives = await listConfirmationArchives(root);
	const groups = await listRecords("groups", root);

	expect(archives.archived).toEqual([
		{ archivedAt: WHEN, groupId: "good-archive" },
	]);
	expect(archives.unreadable.map(({ id }) => id)).toEqual([GROUP]);
	expect(groups.unreadable.map(({ id }) => id)).toContain(`group:${GROUP}`);
}

describe("incomplete confirmation archive", () => {
	it.each([
		"not-json",
		JSON.stringify({
			archivedAt: WHEN,
			groupId: "wrong-identity",
			schemaVersion: 1,
		}),
		JSON.stringify({ archivedAt: WHEN, groupId: GROUP, schemaVersion: 9 }),
	])(
		"clears invalid regular metadata %s and restores the ordinary incomplete action",
		clearsInvalidRegularMetadataValueAndRestoresTheOrdinaryIncompleteAction,
	);
	describe("when archive data or paths are invalid", () => {
		it(
			"reports invalid metadata in version, identity, and timestamp order",
			reportsInvalidMetadataInVersionIdentityAndTimestampOrder,
		);
		it.each([
			"not-json",
			JSON.stringify({ archivedAt: WHEN, groupId: "other", schemaVersion: 1 }),
			JSON.stringify({ archivedAt: WHEN, groupId: GROUP, schemaVersion: 2 }),
		])(
			"isolates invalid metadata %s without suppressing its group",
			isolatesInvalidMetadataValueWithoutSuppressingItsGroup,
		);
	});
});
