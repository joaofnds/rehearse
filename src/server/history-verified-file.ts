import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";

import pathIsWithin from "#benchmark/path-containment";
import { SessionHistoryReaderError } from "#server/history-read-identity";

const TRANSCRIPT_LINE_NUMBER_STEP = 1;

async function openVerifiedFile(
	root: string,
	path: string,
): Promise<FileHandle> {
	const handle = await open(path, constants.O_RDONLY + constants.O_NOFOLLOW);
	try {
		const opened = await handle.stat();
		const canonical = await realpath(path);
		const current = await lstat(path);
		if (
			!opened.isFile() ||
			current.isSymbolicLink() ||
			!current.isFile() ||
			!pathIsWithin(canonical, root) ||
			opened.dev !== current.dev ||
			opened.ino !== current.ino
		) {
			throw new SessionHistoryReaderError(
				"refused",
				"Saved-attempt evidence changed during verification",
			);
		}

		return handle;
	} catch (error) {
		await handle.close();
		throw error;
	}
}

async function readVerifiedFile(root: string, path: string): Promise<string> {
	const handle = await openVerifiedFile(root, path);
	try {
		return await handle.readFile({ encoding: "utf8" });
	} finally {
		await handle.close();
	}
}

async function* readVerifiedLines(
	root: string,
	path: string,
): AsyncGenerator<string> {
	const handle = await openVerifiedFile(root, path);
	try {
		for await (const line of handle.readLines({ autoClose: false })) {
			yield line;
		}
	} finally {
		await handle.close();
	}
}

async function readVerifiedLine(
	root: string,
	path: string,
	selectedLine: number,
): Promise<string | undefined> {
	let lineNumber = 0;
	for await (const line of readVerifiedLines(root, path)) {
		lineNumber += TRANSCRIPT_LINE_NUMBER_STEP;
		if (lineNumber === selectedLine) {
			return line;
		}
	}

	return undefined;
}

export { readVerifiedFile, readVerifiedLines, readVerifiedLine };
