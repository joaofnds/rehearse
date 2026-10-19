import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { captureBoundedContent } from "./checks";
import { runCommand } from "./command";
import { currentSha, git } from "./target-repository";

interface BuildCandidate {
	readonly resultSha: string;
	readonly diff: string;
	readonly changedPaths: readonly string[];
}

async function captureBuildCandidate(
	targetDir: string,
	taskSha: string,
): Promise<BuildCandidate> {
	const resultSha = await git(targetDir, "rev-parse", "HEAD");
	const trackedDiff = await runCommand(
		["git", "diff", "--no-ext-diff", taskSha],
		targetDir,
	);
	const trackedOutput = await git(targetDir, "diff", "--name-only", taskSha);
	const trackedPaths = trackedOutput.split("\n").filter(Boolean);
	const untrackedOutput = await runCommand(
		["git", "ls-files", "--others", "--exclude-standard", "-z"],
		targetDir,
	);
	const untrackedPaths = untrackedOutput.split("\0").filter(Boolean);
	const untrackedDiffs = await Promise.all(
		untrackedPaths.map(async (path) => {
			const content = await captureBoundedContent(
				Bun.file(join(targetDir, path)),
			);
			return `diff --git a/${path} b/${path}\nnew untracked file\n--- /dev/null\n+++ b/${path}\n@@ untracked file @@\n${content}`;
		}),
	);

	return {
		changedPaths: [...new Set([...trackedPaths, ...untrackedPaths])],
		diff: [trackedDiff, ...untrackedDiffs].filter(Boolean).join("\n"),
		resultSha,
	};
}

/**
 * Commits the checkout as it stands, uncommitted and untracked files
 * included, onto no branch. It stages through an index of its own, so HEAD,
 * the checkout's index and its working tree stay as they were. The snapshot
 * descends from the base as well as HEAD, so a ref kept at the base moves to
 * it by fast-forward even when the stage rewrote the history below the base.
 */
async function snapshotCheckout(
	targetDir: string,
	base: string,
): Promise<string> {
	const head = await currentSha(targetDir);
	const parents = [...new Set([head, base])].flatMap((sha) => ["-p", sha]);
	const indexDirectory = await mkdtemp(join(tmpdir(), "rehearse-snapshot-"));
	const options = { env: { GIT_INDEX_FILE: join(indexDirectory, "index") } };

	try {
		await runCommand(["git", "read-tree", "HEAD"], targetDir, options);
		await runCommand(["git", "add", "--all"], targetDir, options);
		const tree = await runCommand(["git", "write-tree"], targetDir, options);

		return await git(
			targetDir,
			"commit-tree",
			tree.trim(),
			...parents,
			"-m",
			"Snapshot of the checkout, uncommitted files included",
		);
	} finally {
		await rm(indexDirectory, { force: true, recursive: true });
	}
}
export { captureBuildCandidate, snapshotCheckout };
export type { BuildCandidate };
