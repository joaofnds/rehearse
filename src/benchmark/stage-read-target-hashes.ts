import { createHash } from "node:crypto";

import type { HashedFile } from "./checkpoint";
import { runCommand } from "./command";

const SUCCESS_EXIT_CODE = 0;

async function blobBytes(
	targetDir: string,
	objectId: string,
): Promise<Uint8Array> {
	const child = Bun.spawn(["git", "cat-file", "blob", objectId], {
		cwd: targetDir,
		stderr: "pipe",
		stdout: "pipe",
	});
	const [bytes, exitCode] = await Promise.all([
		new Response(child.stdout).bytes(),
		child.exited,
	]);
	if (exitCode !== SUCCESS_EXIT_CODE) {
		throw new Error(`git cat-file blob ${objectId} exited ${exitCode}`);
	}

	return bytes;
}

/**
 * A stage may rewrite a file after reading it, so only its starting Git blob
 * establishes which instruction bytes the attempt encountered.
 */
async function hashesAtStart(
	targetDir: string,
	startSha: string,
	paths: readonly string[],
): Promise<readonly HashedFile[]> {
	const files: HashedFile[] = [];
	await Array.fromAsync(paths, async (path) => {
		const listing = await runCommand(
			["git", "ls-tree", "-z", startSha, "--", path],
			targetDir,
		);
		const objectId = /^\d+ blob (?<objectId>[0-9a-f]+)\t/u.exec(listing)
			?.groups?.["objectId"];
		if (objectId !== undefined) {
			files.push({
				path,
				sha256: createHash("sha256")
					.update(await blobBytes(targetDir, objectId))
					.digest("hex"),
			});
		}
	});

	return files;
}

export { hashesAtStart as default };
