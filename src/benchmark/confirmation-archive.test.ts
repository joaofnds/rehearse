import { describe, expect, it } from "bun:test";
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { failureOf, recordOutput } from "#cli/cli-test-support";
import { listRecords } from "#cli/list-command";
import { runShow } from "#cli/show-command";

import {
	archiveConfirmation,
	listConfirmationArchives,
	restoreConfirmation,
} from "./confirmation-archive";
import {
	ConfirmationArchiveFixture,
	GROUP,
	WHEN,
	rejectedArchiveWrite,
} from "./confirmation-archive-test-fixtures";
import {
	confirmationGroupIds,
	confirmationGroupPaths,
	confirmationRepIds,
	confirmationRepStageNames,
} from "./run-layout";

const FAILURE_EXIT_STATUS = 1;

const fixtures = ConfirmationArchiveFixture.forEachTest();

async function archivesAndRestoresAnUnknownGroupWithoutChangingItsSavedInputs(): Promise<void> {
	const root = await fixtures.records();
	const paths = confirmationGroupPaths(root, GROUP);
	const listingBefore = await listRecords("groups", root);
	expect(listingBefore.unreadable.map(({ id }) => id)).toEqual([
		`group:${GROUP}`,
	]);

	await archiveConfirmation({
		archivedAt: WHEN,
		groupId: GROUP,
		runsDirectory: root,
	});

	expect(await listConfirmationArchives(root)).toEqual({
		archived: [{ archivedAt: WHEN, groupId: GROUP }],
		unreadable: [],
	});
	expect(await listRecords("groups", root)).toEqual({
		entries: [],
		unreadable: [],
	});
	expect(await listRecords("archived-groups", root)).toEqual({
		entries: [{ fields: [WHEN, "no saved summary"], id: `group:${GROUP}` }],
		unreadable: [],
	});
	expect(await Bun.file(join(paths.inputsDirectory, "input.txt")).text()).toBe(
		"unchanged input\n",
	);
	expect(await readdir(paths.directory)).toEqual(["inputs"]);
}

async function restoresAnArchivedGroupWithoutChangingSavedInputs(): Promise<void> {
	const root = await fixtures.records();
	const paths = confirmationGroupPaths(root, GROUP);
	await archiveConfirmation({
		archivedAt: WHEN,
		groupId: GROUP,
		runsDirectory: root,
	});

	await restoreConfirmation({ groupId: GROUP, runsDirectory: root });

	expect(await listConfirmationArchives(root)).toEqual({
		archived: [],
		unreadable: [],
	});
	const listingAfter = await listRecords("groups", root);
	expect(listingAfter.unreadable.map(({ id }) => id)).toEqual([
		`group:${GROUP}`,
	]);
	expect(await Bun.file(join(paths.inputsDirectory, "input.txt")).text()).toBe(
		"unchanged input\n",
	);
}

async function restoresIdempotentlyWithoutRequiringAStillMissingGroupSummary(): Promise<void> {
	const root = await fixtures.records();
	await archiveConfirmation({
		archivedAt: WHEN,
		groupId: GROUP,
		runsDirectory: root,
	});
	await Bun.write(
		confirmationGroupPaths(root, GROUP).groupFile,
		"broken summary",
	);

	await restoreConfirmation({ groupId: GROUP, runsDirectory: root });
	await restoreConfirmation({ groupId: GROUP, runsDirectory: root });

	expect(await readdir(join(root, "confirmation-archives"))).toEqual([]);
	expect(
		await Bun.file(confirmationGroupPaths(root, GROUP).groupFile).text(),
	).toBe("broken summary");
}

async function keepsIndependentArchivesWhenADifferentGroupIsRestored(): Promise<void> {
	const root = await fixtures.records();
	await mkdir(confirmationGroupPaths(root, "another-group").directory);
	await archiveConfirmation({
		archivedAt: WHEN,
		groupId: GROUP,
		runsDirectory: root,
	});
	await archiveConfirmation({
		archivedAt: WHEN,
		groupId: "another-group",
		runsDirectory: root,
	});

	await restoreConfirmation({ groupId: GROUP, runsDirectory: root });

	expect(await listConfirmationArchives(root)).toEqual({
		archived: [{ archivedAt: WHEN, groupId: "another-group" }],
		unreadable: [],
	});
}

async function leavesExplicitLookupHonestAboutTheAbsentSummary(): Promise<void> {
	const root = await fixtures.records();
	await archiveConfirmation({
		archivedAt: WHEN,
		groupId: GROUP,
		runsDirectory: root,
	});
	const output = recordOutput();

	const error = await failureOf(
		runShow(
			{ id: `group:${GROUP}`, json: true, runsDirectory: root },
			output.output,
		),
	);

	expect(error).toBeInstanceOf(Error);
	expect(output.stdout).toEqual([]);
}

async function preservesPartialRepEvidenceAcrossArchiveAndRestore(): Promise<void> {
	const root = await fixtures.records();
	const stage = join(
		confirmationGroupPaths(root, GROUP).rep("1").stagesDirectory,
		"shape.json",
	);
	await Bun.write(stage, "partial stage evidence\n");

	await archiveConfirmation({
		archivedAt: WHEN,
		groupId: GROUP,
		runsDirectory: root,
	});
	await restoreConfirmation({ groupId: GROUP, runsDirectory: root });

	expect(await Bun.file(stage).text()).toBe("partial stage evidence\n");
}

async function keepsUnfinishedRepetitionsAndStagesDiscoverableAcrossTheArchiveLifecycle(): Promise<void> {
	const root = await fixtures.records();
	const stage = confirmationGroupPaths(root, GROUP).rep("1").stageFile("shape");
	await Bun.write(stage, "partial stage evidence\n");

	await archiveConfirmation({
		archivedAt: WHEN,
		groupId: GROUP,
		runsDirectory: root,
	});
	const archived = await Promise.all([
		confirmationGroupIds(root),
		confirmationRepIds(root, GROUP),
		confirmationRepStageNames(root, GROUP, "1"),
	]);
	await restoreConfirmation({ groupId: GROUP, runsDirectory: root });
	const restored = await Promise.all([
		confirmationGroupIds(root),
		confirmationRepIds(root, GROUP),
		confirmationRepStageNames(root, GROUP, "1"),
	]);

	expect(archived).toEqual([[GROUP], ["1"], ["shape"]]);
	expect(restored).toEqual([[GROUP], ["1"], ["shape"]]);
}

async function cleansItsTemporaryFileAfterARejectedWriteAndCanRetry(): Promise<void> {
	const root = await fixtures.records();
	const request = { archivedAt: WHEN, groupId: GROUP, runsDirectory: root };
	const { exit, output, errors } = await rejectedArchiveWrite(request);

	expect({ errors, exit }).toEqual({ errors: "", exit: FAILURE_EXIT_STATUS });
	expect(
		z.object({ code: z.literal("EFBIG") }).parse(JSON.parse(output)),
	).toEqual({ code: "EFBIG" });
	expect(await readdir(join(root, "confirmation-archives"))).toEqual([]);
	const savedInputPath = join(
		confirmationGroupPaths(root, GROUP).inputsDirectory,
		"input.txt",
	);
	expect(await Bun.file(savedInputPath).text()).toBe("unchanged input\n");
	await archiveConfirmation(request);
	expect(await listConfirmationArchives(root)).toEqual({
		archived: [{ archivedAt: WHEN, groupId: GROUP }],
		unreadable: [],
	});
}

describe("incomplete confirmation archive", () => {
	it(
		"cleans its temporary file after a rejected write and can retry",
		cleansItsTemporaryFileAfterARejectedWriteAndCanRetry,
	);
	it(
		"archives an unknown group without changing its saved inputs",
		archivesAndRestoresAnUnknownGroupWithoutChangingItsSavedInputs,
	);
	it(
		"restores an archived group without changing saved inputs",
		restoresAnArchivedGroupWithoutChangingSavedInputs,
	);
	it(
		"restores idempotently without requiring a still-missing group summary",
		restoresIdempotentlyWithoutRequiringAStillMissingGroupSummary,
	);
	it(
		"keeps independent archives when a different group is restored",
		keepsIndependentArchivesWhenADifferentGroupIsRestored,
	);
	it(
		"leaves explicit lookup honest about the absent summary",
		leavesExplicitLookupHonestAboutTheAbsentSummary,
	);
	it(
		"preserves partial rep evidence across archive and restore",
		preservesPartialRepEvidenceAcrossArchiveAndRestore,
	);
	it(
		"keeps unfinished repetitions and stages discoverable across the archive lifecycle",
		keepsUnfinishedRepetitionsAndStagesDiscoverableAcrossTheArchiveLifecycle,
	);
});
