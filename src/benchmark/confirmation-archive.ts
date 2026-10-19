import { constants } from "node:fs";
import {
	lstat,
	mkdir,
	open,
	readdir,
	realpath,
	rename,
	rm,
} from "node:fs/promises";
import { join } from "node:path";
import type { FileHandle } from "node:fs/promises";
import { z } from "zod";
import type { Immutable } from "./contracts";
import { isConfirmationIdentity } from "./confirmation-record";
import { stoppedBeforeGroupRecord } from "./operator-stop";
import { confirmationGroupPaths } from "./run-layout";

const groupIdSchema = z.string().refine(isConfirmationIdentity);
const archiveSchema = z.strictObject({
	schemaVersion: z.literal(1),
	groupId: groupIdSchema,
	archivedAt: z.iso.datetime(),
});
export type ConfirmationArchive = Immutable<
	Pick<z.infer<typeof archiveSchema>, "groupId" | "archivedAt">
>;
export interface ConfirmationArchives {
	readonly archived: readonly ConfirmationArchive[];
	readonly unreadable: readonly {
		readonly id: string;
		readonly reason: string;
		readonly groupId?: string;
	}[];
}
export interface ConfirmationArchiveTarget {
	readonly runsDirectory: string;
	readonly groupId: string;
}
export interface ArchiveConfirmationRequest extends ConfirmationArchiveTarget {
	readonly archivedAt: string;
}

export class ConfirmationArchiveRefusalError extends Error {
	public override name = "ConfirmationArchiveRefusalError";
	public constructor(
		public readonly status: 400 | 404 | 409,
		message: string,
	) {
		super(message);
	}
}
function validGroupId(groupId: string): string {
	const parsed = groupIdSchema.safeParse(groupId);
	if (!parsed.success) {
		throw new ConfirmationArchiveRefusalError(
			400,
			"Invalid confirmation group ID",
		);
	}

	return parsed.data;
}
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
			409,
			"Confirmation archive paths must be real directories",
		);
	}
}
async function archiveDirectory(runsDirectory: string): Promise<string> {
	return join(await realpath(runsDirectory), "confirmation-archives");
}
async function openArchiveFile(
	directoryPath: string,
	groupId: string,
): Promise<FileHandle | undefined> {
	const file = join(directoryPath, `${validGroupId(groupId)}.json`);
	if (!(await exists(file))) {
		return undefined;
	}

	await directory(directoryPath);
	const fileState = await lstat(file);
	if (!fileState.isFile() || fileState.isSymbolicLink()) {
		throw new ConfirmationArchiveRefusalError(
			409,
			"Confirmation archive metadata must be a regular file",
		);
	}

	const handle = await open(file, constants.O_NOFOLLOW);
	const opened = await handle.stat();
	if (!opened.isFile()) {
		await handle.close();
		throw new ConfirmationArchiveRefusalError(
			409,
			"Confirmation archive metadata must be a regular file",
		);
	}

	return handle;
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
		const record = archiveSchema.parse(
			JSON.parse(await handle.readFile("utf8")),
		);
		if (record.groupId !== groupId) {
			throw new ConfirmationArchiveRefusalError(
				409,
				"Confirmation archive identity does not match its filename",
			);
		}

		return { groupId: record.groupId, archivedAt: record.archivedAt };
	} finally {
		await handle.close();
	}
}
export async function readConfirmationArchive(
	target: ConfirmationArchiveTarget,
): Promise<ConfirmationArchive | undefined> {
	await missingSummary(target);
	const path = await archiveDirectory(target.runsDirectory);
	if (!(await exists(path))) {
		return undefined;
	}

	await directory(path);

	return readArchive(path, target.groupId);
}
export async function hasConfirmationSummary(
	target: ConfirmationArchiveTarget,
): Promise<boolean> {
	const root = await realpath(target.runsDirectory);
	return exists(
		confirmationGroupPaths(root, validGroupId(target.groupId)).groupFile,
	);
}
async function missingSummary(
	target: ConfirmationArchiveTarget,
): Promise<void> {
	const root = await realpath(target.runsDirectory);
	const groupId = validGroupId(target.groupId);
	const confirmations = join(root, "confirmations");
	const paths = confirmationGroupPaths(root, groupId);
	if (!(await exists(confirmations)) || !(await exists(paths.directory))) {
		throw new ConfirmationArchiveRefusalError(
			404,
			"Confirmation group does not exist",
		);
	}

	await directory(confirmations);
	await directory(paths.directory);
	if (await exists(paths.groupFile)) {
		throw new ConfirmationArchiveRefusalError(
			409,
			"Confirmation group has a saved summary",
		);
	}

	if (await exists(paths.operatorStopFile)) {
		const stop = await lstat(paths.operatorStopFile);
		if (!stop.isFile() || stop.isSymbolicLink()) {
			throw new ConfirmationArchiveRefusalError(
				409,
				"Confirmation operator stop must be a regular file",
			);
		}
	}

	if (await stoppedBeforeGroupRecord(paths)) {
		throw new ConfirmationArchiveRefusalError(
			409,
			"Confirmation group has an operator stop record",
		);
	}
}
export async function archiveConfirmation(
	request: ArchiveConfirmationRequest,
): Promise<ConfirmationArchive> {
	await missingSummary(request);

	const record = archiveSchema.parse({
		schemaVersion: 1,
		groupId: request.groupId,
		archivedAt: request.archivedAt,
	});
	const path = await archiveDirectory(request.runsDirectory);
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
	await readArchive(path, request.groupId);

	const file = join(path, `${request.groupId}.json`);
	const temporary = join(
		path,
		`${request.groupId}.${crypto.randomUUID()}.partial`,
	);
	const handle = await open(temporary, "wx");
	try {
		await handle.writeFile(`${JSON.stringify(record, null, 2)}\n`);
		await handle.close();
		await directory(path);
		await rename(temporary, file);
	} catch (error) {
		// Cleanup must preserve the operation's failure; this exclusive file belongs to this writer.
		await Promise.allSettled([handle.close(), rm(temporary, { force: true })]);
		throw error;
	}

	return { groupId: record.groupId, archivedAt: record.archivedAt };
}
export async function restoreConfirmation(
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
export async function listConfirmationArchives(
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
	const archived: ConfirmationArchive[] = [];
	const unreadable: {
		readonly id: string;
		readonly reason: string;
		readonly groupId?: string;
	}[] = [];
	const names = await readdir(path);
	for (const name of names
		.filter((entry) => entry.endsWith(".json"))
		.toSorted()) {
		const groupId = name.slice(0, -5);
		try {
			const root = await realpath(runsDirectory);
			const paths = confirmationGroupPaths(root, validGroupId(groupId));
			if (await exists(paths.groupFile)) {
				continue;
			}

			await missingSummary({ runsDirectory, groupId });
			const record = await readArchive(path, groupId);
			if (record !== undefined) {
				archived.push(record);
			}
		} catch (error) {
			const diagnostic = {
				id: groupId,
				reason: error instanceof Error ? error.message : String(error),
			};
			const identity = groupIdSchema.safeParse(groupId);
			let recoverable = false;
			if (identity.success) {
				try {
					const found = await lstat(join(path, `${identity.data}.json`));
					recoverable = found.isFile() && !found.isSymbolicLink();
				} catch {
					recoverable = false;
				}
			}

			unreadable.push(recoverable ? { ...diagnostic, groupId } : diagnostic);
		}
	}

	return { archived, unreadable };
}
