import { mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RESOURCE_DRAIN_START_INDEX = 0;

const roots: string[] = [];

async function clearRedactionRoots(): Promise<void> {
	await Promise.all(
		roots.splice(RESOURCE_DRAIN_START_INDEX).map(async (root) => {
			await rm(root, { force: true, recursive: true });
		}),
	);
}

async function temporaryDirectory(prefix: string): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), prefix));
	roots.push(root);

	return root;
}

async function messageFromReadingMissingFile(
	directoryName: string,
): Promise<{ message: string; root: string }> {
	const root = await temporaryDirectory(directoryName);

	try {
		await readFile(join(root, "secret.md"), "utf8");
	} catch (error) {
		if (error instanceof Error) {
			return { message: error.message, root };
		}
	}

	throw new Error("reading a missing file did not throw an Error");
}

async function messageFromRenamingMissingFile(): Promise<string> {
	const root = await temporaryDirectory("rehearse-redact-rename-");

	try {
		await rename(join(root, "from.md"), join(root, "to.md"));
	} catch (error) {
		if (error instanceof Error) {
			return error.message;
		}
	}

	throw new Error("renaming a missing file did not throw an Error");
}

export {
	messageFromReadingMissingFile,
	messageFromRenamingMissingFile,
	clearRedactionRoots,
};
