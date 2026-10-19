import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import { z } from "zod";

import { confirmationGroupPaths } from "#benchmark/run-layout";
import {
	GROUP,
	clearArchiveServers,
	server,
} from "#server/confirmation-archive-test-fixture";

const NONEMPTY_MESSAGE_LENGTH = 1;

const archiveSchema = z.object({
	archivedAt: z.iso.datetime(),
	groupId: z.string(),
});

const unreadableArchiveSchema = z.object({
	groupId: z.string().optional(),
	id: z.string(),
	reason: z.string(),
});

const listingSchema = z.object({
	archived: z.array(archiveSchema),
	unreadable: z.array(unreadableArchiveSchema),
});

const errorSchema = z.object({
	error: z.string().min(NONEMPTY_MESSAGE_LENGTH),
});

describe("/api/confirmation-archives", registerApiConfirmationArchives);

async function verifyArchivesThroughTheGuardedApplicationAndExposesARestorableCollection(): Promise<void> {
	const app = await server();

	const response = await app.write("archive");

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	const archived = archiveSchema.parse(await response.json());
	expect(archived.groupId).toBe(GROUP);
	const listed = await app.list();
	expect(listed.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(listingSchema.parse(await listed.json())).toEqual({
		archived: [archived],
		unreadable: [],
	});
	const savedInputPath = join(
		confirmationGroupPaths(app.root, GROUP).inputsDirectory,
		"saved.txt",
	);
	expect(await Bun.file(savedInputPath).text()).toBe("evidence");
}

async function verifyRestoresThroughTheGuardedApplicationWithoutDeletingSavedEvidence(): Promise<void> {
	const app = await server();
	const archived = await app.write("archive");
	expect(archived.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);

	const response = await app.write("restore");

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(await response.json()).toEqual({ restored: true });
	const listed = await app.list();
	expect(listingSchema.parse(await listed.json())).toEqual({
		archived: [],
		unreadable: [],
	});
	const savedInputPath = join(
		confirmationGroupPaths(app.root, GROUP).inputsDirectory,
		"saved.txt",
	);
	expect(await Bun.file(savedInputPath).text()).toBe("evidence");
}

async function verifyClearsCorruptRegularMetadataThroughRestoreUsingItsServerAuthoredGroupIdentity(): Promise<void> {
	const app = await server();
	await Bun.write(
		join(app.root, "confirmation-archives", `${GROUP}.json`),
		"not-json",
	);
	const before = await app.list();
	const report = listingSchema.parse(await before.json());
	expect(report.unreadable.map(({ id, groupId }) => ({ groupId, id }))).toEqual(
		[{ groupId: GROUP, id: GROUP }],
	);

	const response = await app.write("restore");

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	const after = await app.list();
	expect(listingSchema.parse(await after.json())).toEqual({
		archived: [],
		unreadable: [],
	});
	expect(
		await Bun.file(
			`${confirmationGroupPaths(app.root, GROUP).inputsDirectory}/saved.txt`,
		).text(),
	).toBe("evidence");
}

async function verifyRejectsAnInvalidIdentity(): Promise<void> {
	const app = await server();

	const response = await app.write("archive", "../escape");

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_BAD_REQUEST);
	expect(errorSchema.parse(await response.json()).error).toBe(
		"Invalid confirmation group ID",
	);
}

async function verifyRejectsAnAbsentGroup(): Promise<void> {
	const app = await server();

	const response = await app.write("archive", "absent");

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_NOT_FOUND);
	expect(errorSchema.parse(await response.json()).error).toBe(
		"Confirmation group does not exist",
	);
}

async function verifyRejectsAGroupWithASavedSummary(): Promise<void> {
	const app = await server();
	await Bun.write(confirmationGroupPaths(app.root, GROUP).groupFile, "{}");

	const response = await app.write("archive");

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(errorSchema.parse(await response.json()).error).toBe(
		"Confirmation group has a saved summary",
	);
}

async function verifyReportsRefusedPersistenceAndKeepsTheIncompleteGroupAvailable(): Promise<void> {
	const app = await server();
	await Bun.write(
		join(app.root, "confirmation-archives"),
		"unwritable directory",
	);

	const response = await app.write("archive");

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(errorSchema.parse(await response.json()).error).toBe(
		"Confirmation archive paths must be real directories",
	);
	const savedInputPath = join(
		confirmationGroupPaths(app.root, GROUP).inputsDirectory,
		"saved.txt",
	);
	expect(await Bun.file(savedInputPath).text()).toBe("evidence");
}

function registerApiConfirmationArchivesWhenRequestsAreRefused(): void {
	it.each(["archive", "restore"] as const)(
		"rejects cross-origin %s requests without changing metadata",
		async (action) => {
			const app = await server();

			const response = await app.write(action, GROUP, {
				origin: "https://attacker.test",
			});

			expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_FORBIDDEN);
			const listed = await app.list();
			expect(listingSchema.parse(await listed.json())).toEqual({
				archived: [],
				unreadable: [],
			});
		},
	);
	it.each(["archive", "restore"] as const)(
		"rejects non-JSON %s requests",
		async (action) => {
			const app = await server();

			const response = await app.write(action, GROUP, {
				"content-type": "text/plain",
			});

			expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_FORBIDDEN);
		},
	);
	it("rejects an invalid identity", verifyRejectsAnInvalidIdentity);
	it("rejects an absent group", verifyRejectsAnAbsentGroup);
	it(
		"rejects a group with a saved summary",
		verifyRejectsAGroupWithASavedSummary,
	);
	it(
		"reports refused persistence and keeps the incomplete group available",
		verifyReportsRefusedPersistenceAndKeepsTheIncompleteGroupAvailable,
	);
}

function registerApiConfirmationArchives(): void {
	afterEach(clearArchiveServers);
	it(
		"archives through the guarded application and exposes a restorable collection",
		verifyArchivesThroughTheGuardedApplicationAndExposesARestorableCollection,
	);
	it(
		"restores through the guarded application without deleting saved evidence",
		verifyRestoresThroughTheGuardedApplicationWithoutDeletingSavedEvidence,
	);
	it(
		"clears corrupt regular metadata through restore using its server-authored group identity",
		verifyClearsCorruptRegularMetadataThroughRestoreUsingItsServerAuthoredGroupIdentity,
	);

	describe(
		"when requests are refused",
		registerApiConfirmationArchivesWhenRequestsAreRefused,
	);
}
