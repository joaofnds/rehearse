import { constants } from "node:fs";
import type { Stats } from "node:fs";
import { lstat, mkdir, open, realpath, rename, rm } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import {
	ConfirmationArchiveRefusalError,
	archiveSchema,
	groupIdSchema,
	validGroupId,
} from "./confirmation-archive-contract";
import type { ConfirmationArchive } from "./confirmation-archive-contract";

const CONFLICT = 409;
const JSON_INDENT_SPACES = 2;

const archiveDiagnosticPriorities = new Map(
	["schemaVersion", "groupId", "archivedAt"].map(
		(field, priority) => [field, priority] as const,
	),
);
async function exists(path: string): Promise<boolean> {
	try {
		await lstat(path);
		return true;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return false;
		}

		throw error;
	}
}
async function directory(path: string): Promise<void> {
	const found = await lstat(path);
	if (!found.isDirectory() || found.isSymbolicLink()) {
		throw new ConfirmationArchiveRefusalError(
			CONFLICT,
			"Confirmation archive paths must be real directories",
		);
	}
}
async function archiveDirectory(runsDirectory: string): Promise<string> {
	return join(await realpath(runsDirectory), "confirmation-archives");
}

interface ArchiveMetadataLocation {
	readonly directoryPath: string;
	readonly file: string;
}
interface OpenedArchiveMetadata {
	readonly handle: FileHandle;
	readonly state: Stats;
}
interface ArchiveContents {
	readonly contents: string;
	readonly groupId: string;
}
interface ArchiveMetadataTarget {
	readonly directoryPath: string;
	readonly groupId: string;
}

async function regularFile(path: string): Promise<boolean> {
	const state = await lstat(path);
	return state.isFile();
}

async function regularArchiveMetadata(
	location: ArchiveMetadataLocation,
): Promise<boolean> {
	await directory(location.directoryPath);
	return await regularFile(location.file);
}

async function openedArchiveMetadata(
	file: string,
): Promise<OpenedArchiveMetadata> {
	const handle = await open(file, constants.O_NOFOLLOW);
	try {
		const state = await handle.stat();

		return { handle, state };
	} catch (error) {
		await Promise.allSettled([handle.close()]);
		throw error;
	}
}

async function openArchiveFile(
	directoryPath: string,
	groupId: string,
): Promise<FileHandle | undefined> {
	const file = join(directoryPath, `${validGroupId(groupId)}.json`);
	if (!(await exists(file))) {
		return undefined;
	}

	if (!(await regularArchiveMetadata({ directoryPath, file }))) {
		throw new ConfirmationArchiveRefusalError(
			CONFLICT,
			"Confirmation archive metadata must be a regular file",
		);
	}

	const { handle, state } = await openedArchiveMetadata(file);
	if (!state.isFile()) {
		await handle.close();
		throw new ConfirmationArchiveRefusalError(
			CONFLICT,
			"Confirmation archive metadata must be a regular file",
		);
	}

	return handle;
}
function parseArchive({
	contents,
	groupId,
}: ArchiveContents): ConfirmationArchive {
	const parsed = archiveSchema.safeParse(JSON.parse(contents));
	if (!parsed.success) {
		throw new z.ZodError(
			parsed.error.issues.toSorted(
				(left, right) =>
					archiveIssuePriority(left.path) - archiveIssuePriority(right.path),
			),
		);
	}

	const record = parsed.data;
	if (record.groupId !== groupId) {
		throw new ConfirmationArchiveRefusalError(
			CONFLICT,
			"Confirmation archive identity does not match its filename",
		);
	}

	return { archivedAt: record.archivedAt, groupId: record.groupId };
}
async function readArchive(
	directoryPath: string,
	groupId: string,
): Promise<ConfirmationArchive | undefined> {
	const handle = await openArchiveFile(directoryPath, groupId);
	if (handle === undefined) {
		return undefined;
	}

	try {
		return parseArchive({ contents: await handle.readFile("utf8"), groupId });
	} finally {
		await handle.close();
	}
}
function archiveIssuePriority(path: readonly PropertyKey[]): number {
	const [field] = path;
	return (
		archiveDiagnosticPriorities.get(String(field)) ??
		archiveDiagnosticPriorities.size
	);
}

async function ensureArchiveDirectory(path: string): Promise<void> {
	if (!(await exists(path))) {
		try {
			await mkdir(path);
		} catch (error) {
			if (
				!(error instanceof Error && "code" in error && error.code === "EEXIST")
			) {
				throw error;
			}
		}
	}

	await directory(path);
}
async function writeArchive(
	path: string,
	record: z.infer<typeof archiveSchema>,
): Promise<void> {
	const file = join(path, `${record.groupId}.json`);
	const temporary = join(
		path,
		`${record.groupId}.${crypto.randomUUID()}.partial`,
	);
	const handle = await open(temporary, "wx");
	try {
		await handle.writeFile(
			`${JSON.stringify(record, null, JSON_INDENT_SPACES)}\n`,
		);
		await handle.close();
		await directory(path);
		await rename(temporary, file);
	} catch (error) {
		await Promise.allSettled([handle.close(), rm(temporary, { force: true })]);
		throw error;
	}
}
async function recoverableArchive({
	directoryPath,
	groupId,
}: ArchiveMetadataTarget): Promise<boolean> {
	const identity = groupIdSchema.safeParse(groupId);
	if (!identity.success) {
		return false;
	}

	try {
		const found = await lstat(join(directoryPath, `${identity.data}.json`));
		return found.isFile() && !found.isSymbolicLink();
	} catch (error) {
		if (
			error instanceof Error &&
			"syscall" in error &&
			error.syscall === "lstat"
		) {
			return false;
		}

		throw error;
	}
}
export {
	exists,
	regularFile,
	directory,
	archiveDirectory,
	openArchiveFile,
	readArchive,
	ensureArchiveDirectory,
	writeArchive,
	recoverableArchive,
};
