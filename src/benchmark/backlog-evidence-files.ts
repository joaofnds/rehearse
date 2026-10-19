import type { FileHandle } from "node:fs/promises";
import { open, readdir, realpath } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { SymlinkedEntryError } from "./file-presence";
import pathIsWithin from "./path-containment";

interface WorkflowEvidenceEntry {
	readonly board: string;
	readonly path: string;
}

interface WorkflowBoard {
	readonly board: string;
	readonly targetDir: string;
}

async function workflowBoardPath({
	board,
	targetDir,
}: WorkflowBoard): Promise<string> {
	const target = await realpath(targetDir);
	const expected = resolve(target, relative(targetDir, board));
	const root = await realpath(board);

	if (root !== expected || root === target || !pathIsWithin(root, target)) {
		throw new SymlinkedEntryError(
			"The workflow board must be a directory held inside the target",
		);
	}

	return root;
}

async function workflowEntryPath({
	board,
	path,
}: WorkflowEvidenceEntry): Promise<string> {
	const destination = await realpath(path);

	if (!pathIsWithin(destination, board)) {
		throw new SymlinkedEntryError(
			`${relative(board, path)} resolves outside the board, so its bytes are not workflow evidence`,
		);
	}

	return destination;
}

class OpenedWorkflowText {
	public constructor(private readonly file: FileHandle) {}

	public async read(): Promise<string> {
		return await this.file.readFile("utf8");
	}

	public async close(): Promise<void> {
		await this.file.close();
	}
}

/** Validate the opened Bun descriptor, then consume that same file object. */
async function openWorkflowText(
	entry: WorkflowEvidenceEntry,
): Promise<OpenedWorkflowText> {
	const path = await workflowEntryPath(entry);
	const file = await open(path, "r");
	try {
		await workflowEntryPath({
			board: entry.board,
			path: `/dev/fd/${String(file.fd)}`,
		});
		return new OpenedWorkflowText(file);
	} catch (error) {
		await file.close();
		throw error;
	}
}

async function readWorkflowText(entry: WorkflowEvidenceEntry): Promise<string> {
	const file = await openWorkflowText(entry);
	try {
		return await file.read();
	} finally {
		await file.close();
	}
}

async function readWorkflowDocuments(board: string): Promise<string[]> {
	try {
		const directory = await workflowEntryPath({
			board,
			path: join(board, "docs"),
		});
		return await readdir(directory);
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return [];
		}

		throw error;
	}
}

export {
	openWorkflowText,
	readWorkflowDocuments,
	readWorkflowText,
	workflowBoardPath,
	workflowEntryPath,
};
