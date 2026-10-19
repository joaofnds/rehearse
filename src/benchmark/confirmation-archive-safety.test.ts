import { describe, expect, it } from "bun:test";
import { readdir, rm, symlink } from "node:fs/promises";
import { join } from "node:path";

import { failureOf } from "#cli/cli-test-support";
import { listRecords } from "#cli/list-command";

import {
	ConfirmationArchiveRefusalError,
	archiveConfirmation,
	listConfirmationArchives,
	restoreConfirmation,
} from "./confirmation-archive";
import { recoverableArchive } from "./confirmation-archive-storage";
import {
	ConfirmationArchiveFixture,
	GROUP,
	WHEN,
} from "./confirmation-archive-test-fixtures";
import { operatorStopRecord } from "./operator-stop";
import { confirmationGroupPaths } from "./run-layout";

const FIRST_UNREADABLE_INDEX = 0;
const fixtures = ConfirmationArchiveFixture.forEachTest();

async function refusesIdentityValue(groupId: string): Promise<void> {
	const root = await fixtures.records();

	expect(
		await failureOf(
			archiveConfirmation({
				archivedAt: WHEN,
				groupId,
				runsDirectory: root,
			}),
		),
	).toBeInstanceOf(ConfirmationArchiveRefusalError);
	expect(
		await failureOf(restoreConfirmation({ groupId, runsDirectory: root })),
	).toBeInstanceOf(ConfirmationArchiveRefusalError);
}

async function refusesAMissingGroupWithoutCreatingMetadata(): Promise<void> {
	const root = await fixtures.records();

	expect(
		await failureOf(
			archiveConfirmation({
				archivedAt: WHEN,
				groupId: "missing",
				runsDirectory: root,
			}),
		),
	).toBeInstanceOf(ConfirmationArchiveRefusalError);

	expect(await listConfirmationArchives(root)).toEqual({
		archived: [],
		unreadable: [],
	});
}

async function refusesAnExistingSummaryContainingValue(
	summary: string,
): Promise<void> {
	const root = await fixtures.records();
	await Bun.write(confirmationGroupPaths(root, GROUP).groupFile, summary);

	expect(
		await failureOf(
			archiveConfirmation({
				archivedAt: WHEN,
				groupId: GROUP,
				runsDirectory: root,
			}),
		),
	).toBeInstanceOf(ConfirmationArchiveRefusalError);

	expect(await listConfirmationArchives(root)).toEqual({
		archived: [],
		unreadable: [],
	});
}

async function preservesExistingOperatorStopExclusion(): Promise<void> {
	const root = await fixtures.records();
	await Bun.write(
		confirmationGroupPaths(root, GROUP).operatorStopFile,
		operatorStopRecord("SIGTERM"),
	);

	expect(
		await failureOf(
			archiveConfirmation({
				archivedAt: WHEN,
				groupId: GROUP,
				runsDirectory: root,
			}),
		),
	).toBeInstanceOf(ConfirmationArchiveRefusalError);

	expect(await listRecords("groups", root)).toEqual({
		entries: [],
		unreadable: [],
	});
}

async function refusesASymlinkedValueDirectory(name: string): Promise<void> {
	const root = await fixtures.records();
	const outside = await fixtures.records();
	await rm(join(root, name), { force: true, recursive: true });
	await symlink(join(outside, "confirmations"), join(root, name));

	expect(
		await failureOf(
			archiveConfirmation({
				archivedAt: WHEN,
				groupId: GROUP,
				runsDirectory: root,
			}),
		),
	).toBeInstanceOf(ConfirmationArchiveRefusalError);

	expect(
		await readdir(confirmationGroupPaths(outside, GROUP).directory),
	).toEqual(["inputs"]);
}

async function refusesAnOperatorStopSymlinkBeforeReadingOutsideGroupEvidence(): Promise<void> {
	const root = await fixtures.records();
	const outside = join(root, "outside-stop.json");
	await Bun.write(outside, operatorStopRecord("SIGTERM"));
	await symlink(outside, confirmationGroupPaths(root, GROUP).operatorStopFile);

	const error = await failureOf(
		archiveConfirmation({
			archivedAt: WHEN,
			groupId: GROUP,
			runsDirectory: root,
		}),
	);

	expect(error).toBeInstanceOf(ConfirmationArchiveRefusalError);
	expect(error.message).toBe(
		"Confirmation operator stop must be a regular file",
	);
	expect(await Bun.file(outside).text()).toBe(operatorStopRecord("SIGTERM"));
}

async function refusesASymlinkedGroupDirectory(): Promise<void> {
	const root = await fixtures.records();
	const outside = await fixtures.records();
	await rm(confirmationGroupPaths(root, GROUP).directory, {
		recursive: true,
	});
	await symlink(
		confirmationGroupPaths(outside, GROUP).directory,
		confirmationGroupPaths(root, GROUP).directory,
	);

	expect(
		await failureOf(
			archiveConfirmation({
				archivedAt: WHEN,
				groupId: GROUP,
				runsDirectory: root,
			}),
		),
	).toBeInstanceOf(ConfirmationArchiveRefusalError);
}

async function refusesSymlinkedMetadataOnReadWriteAndRestore(): Promise<void> {
	const root = await fixtures.records();
	const outside = await ConfirmationArchiveFixture.metadataSymlink(root);

	const archives = await listConfirmationArchives(root);

	expect(archives.archived).toEqual([]);
	expect(archives.unreadable.map(({ id }) => id)).toEqual([GROUP]);
	expect(archives.unreadable[FIRST_UNREADABLE_INDEX]?.groupId).toBeUndefined();
	expect(
		await failureOf(
			archiveConfirmation({
				archivedAt: WHEN,
				groupId: GROUP,
				runsDirectory: root,
			}),
		),
	).toBeInstanceOf(ConfirmationArchiveRefusalError);
	expect(
		await failureOf(
			restoreConfirmation({ groupId: GROUP, runsDirectory: root }),
		),
	).toBeInstanceOf(ConfirmationArchiveRefusalError);
	expect(await Bun.file(outside).text()).toBe(
		JSON.stringify({ archivedAt: WHEN, groupId: GROUP, schemaVersion: 1 }),
	);
}

async function keepsGroupsVisibleWhenMetadataCannotBeWritten(): Promise<void> {
	const root = await fixtures.records();
	await Bun.write(join(root, "confirmation-archives"), "not a directory");

	expect(
		await failureOf(
			archiveConfirmation({
				archivedAt: WHEN,
				groupId: GROUP,
				runsDirectory: root,
			}),
		),
	).toBeInstanceOf(ConfirmationArchiveRefusalError);
	const groups = await listRecords("groups", root);

	expect(groups.unreadable.map(({ id }) => id)).toEqual([`group:${GROUP}`]);
	const savedInputPath = join(
		confirmationGroupPaths(root, GROUP).inputsDirectory,
		"input.txt",
	);
	expect(await Bun.file(savedInputPath).text()).toBe("unchanged input\n");
}

async function propagatesInvalidPathErrorsFromRecoveryInspection(): Promise<void> {
	const error = await failureOf(
		recoverableArchive({ directoryPath: "\0invalid", groupId: GROUP }),
	);

	expect(error).toBeInstanceOf(TypeError);
}

describe("incomplete confirmation archive", () => {
	describe("when archive data or paths are invalid", () => {
		it.each(["../escape", "a/b", ".", "", String.raw`a\b`])(
			"refuses identity %s",
			refusesIdentityValue,
		);
		it(
			"refuses a missing group without creating metadata",
			refusesAMissingGroupWithoutCreatingMetadata,
		);
		it.each(["{}", "not-json"])(
			"refuses an existing summary containing %s",
			refusesAnExistingSummaryContainingValue,
		);
		it(
			"preserves existing operator-stop exclusion",
			preservesExistingOperatorStopExclusion,
		);
		it.each(["confirmations", "confirmation-archives"])(
			"refuses a symlinked %s directory",
			refusesASymlinkedValueDirectory,
		);
		it(
			"refuses an operator-stop symlink before reading outside group evidence",
			refusesAnOperatorStopSymlinkBeforeReadingOutsideGroupEvidence,
		);
		it("refuses a symlinked group directory", refusesASymlinkedGroupDirectory);
		it(
			"refuses symlinked metadata on read, write and restore",
			refusesSymlinkedMetadataOnReadWriteAndRestore,
		);
		it(
			"keeps groups visible when metadata cannot be written",
			keepsGroupsVisibleWhenMetadataCannotBeWritten,
		);
		it(
			"propagates invalid path errors from recovery inspection",
			propagatesInvalidPathErrorsFromRecoveryInspection,
		);
	});
});
