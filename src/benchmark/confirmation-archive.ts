import { readdir, realpath, rm } from "node:fs/promises";
import { join } from "node:path";

import concurrentMap from "./concurrent-map";
import {
	ARCHIVE_SCHEMA_VERSION,
	archiveSchema,
	validGroupId,
} from "./confirmation-archive-contract";
import type {
	ArchiveConfirmationRequest,
	ConfirmationArchive,
	ConfirmationArchiveTarget,
	ConfirmationArchives,
} from "./confirmation-archive-contract";
import { missingSummary } from "./confirmation-archive-eligibility";
import {
	archiveDirectory,
	directory,
	ensureArchiveDirectory,
	exists,
	openArchiveFile,
	readArchive,
	recoverableArchive,
	writeArchive,
} from "./confirmation-archive-storage";
import { confirmationGroupPaths } from "./run-layout";

const FILE_NAME_START = 0;
const JSON_EXTENSION_LENGTH = 5;

async function readConfirmationArchive(
	target: ConfirmationArchiveTarget,
): Promise<ConfirmationArchive | undefined> {
	await missingSummary(target);
	const path = await archiveDirectory(target.runsDirectory);
	if (!(await exists(path))) {
		return undefined;
	}

	await directory(path);

	return await readArchive(path, target.groupId);
}

async function archiveConfirmation(
	request: ArchiveConfirmationRequest,
): Promise<ConfirmationArchive> {
	await missingSummary(request);
	const record = archiveSchema.parse({
		archivedAt: request.archivedAt,
		groupId: request.groupId,
		schemaVersion: ARCHIVE_SCHEMA_VERSION,
	});
	const path = await archiveDirectory(request.runsDirectory);

	await ensureArchiveDirectory(path);
	await readArchive(path, request.groupId);
	await writeArchive(path, record);

	return { archivedAt: record.archivedAt, groupId: record.groupId };
}
async function restoreConfirmation(
	target: ConfirmationArchiveTarget,
): Promise<void> {
	validGroupId(target.groupId);
	const path = await archiveDirectory(target.runsDirectory);
	if (!(await exists(path))) {
		return;
	}

	await directory(path);
	const handle = await openArchiveFile(path, target.groupId);
	if (handle === undefined) {
		return;
	}

	await handle.close();
	await rm(join(path, `${target.groupId}.json`), { force: true });
}

interface ArchiveReadingRequest {
	readonly runsDirectory: string;
	readonly path: string;
	readonly groupId: string;
}
async function readListedArchive({
	runsDirectory,
	path,
	groupId,
}: ArchiveReadingRequest): Promise<ConfirmationArchives> {
	try {
		const root = await realpath(runsDirectory);
		const paths = confirmationGroupPaths(root, validGroupId(groupId));
		if (await exists(paths.groupFile)) {
			return { archived: [], unreadable: [] };
		}

		await missingSummary({ groupId, runsDirectory });
		const record = await readArchive(path, groupId);

		return { archived: record === undefined ? [] : [record], unreadable: [] };
	} catch (error) {
		const diagnostic = {
			id: groupId,
			reason: error instanceof Error ? error.message : String(error),
		};
		return {
			archived: [],
			unreadable: [
				(await recoverableArchive({ directoryPath: path, groupId }))
					? { ...diagnostic, groupId }
					: diagnostic,
			],
		};
	}
}
async function listConfirmationArchives(
	runsDirectory: string,
): Promise<ConfirmationArchives> {
	if (!(await exists(runsDirectory))) {
		return { archived: [], unreadable: [] };
	}

	const path = await archiveDirectory(runsDirectory);
	if (!(await exists(path))) {
		return { archived: [], unreadable: [] };
	}

	await directory(path);
	const entries = await readdir(path);
	const names = entries.filter((entry) => entry.endsWith(".json")).toSorted();
	const readings = await concurrentMap(
		names,
		async (name) =>
			await readListedArchive({
				groupId: name.slice(FILE_NAME_START, -JSON_EXTENSION_LENGTH),
				path,
				runsDirectory,
			}),
	);

	return {
		archived: readings.flatMap((reading) => reading.archived),
		unreadable: readings.flatMap((reading) => reading.unreadable),
	};
}

export { ConfirmationArchiveRefusalError } from "./confirmation-archive-contract";
export {
	readConfirmationArchive,
	archiveConfirmation,
	restoreConfirmation,
	listConfirmationArchives,
};
export type {
	ConfirmationArchive,
	ConfirmationArchives,
	ConfirmationArchiveTarget,
	ArchiveConfirmationRequest,
} from "./confirmation-archive-contract";

export { hasConfirmationSummary } from "./confirmation-archive-eligibility";
