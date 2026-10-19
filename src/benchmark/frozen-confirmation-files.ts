import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

import type {
	ConfirmationGroupRecord,
	SessionConfirmationGroupRecord,
} from "./confirmation-record";

interface FrozenFile {
	readonly kind:
		| ConfirmationGroupRecord["inputs"]["files"][number]["kind"]
		| SessionConfirmationGroupRecord["inputs"]["files"][number]["kind"];
	readonly path: string;
	readonly sha256: string;
}

interface FrozenFileContent {
	readonly path: string;
	readonly content: string;
	readonly kind: FrozenFile["kind"];
}

async function writeFrozenFile(
	groupDirectory: string,
	{ path, content, kind }: FrozenFileContent,
): Promise<FrozenFile> {
	await Bun.write(path, content);

	return {
		kind,
		path: relative(groupDirectory, path),
		sha256: createHash("sha256").update(content).digest("hex"),
	};
}

async function frozenDirectoryFiles(
	groupDirectory: string,
	directory: string,
	kind: FrozenFile["kind"],
): Promise<readonly FrozenFile[]> {
	const files: FrozenFile[] = [];
	const entries = await readdir(directory, { recursive: true });
	await Array.fromAsync(entries.toSorted(), async (entry) => {
		const path = join(directory, entry);
		const file = Bun.file(path);
		if (!(await file.exists()) || file.type === "directory") {
			return;
		}

		const bytes = await file.bytes();
		files.push({
			kind,
			path: relative(groupDirectory, path),
			sha256: createHash("sha256").update(bytes).digest("hex"),
		});
	});

	return files;
}

export { writeFrozenFile, frozenDirectoryFiles };
export type { FrozenFile };
