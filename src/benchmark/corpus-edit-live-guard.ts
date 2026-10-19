import { realpath } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { CorpusRoot, LiveCorpusRoot } from "./corpus-file";
import pathIsWithin from "./path-containment";
import { LINK_CORPUS_COMMAND } from "./settings";
/** The real path, or the resolved one for a path that does not exist yet. */
async function realOrResolved(path: string): Promise<string> {
	try {
		return await realpath(path);
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return resolve(path);
		}

		throw error;
	}
}

const LIVE_INSTALL_REFUSAL = `The linked corpus directory resolves into the live install, which every agent session on this machine loads as instructions, so edits to it belong where it is produced. Link a copy to edit with: ${LINK_CORPUS_COMMAND}`;

/** Whether any of the real paths lies under the live install's real roots. */
async function reachesLiveInstall(
	live: LiveCorpusRoot,
	written: readonly string[],
): Promise<boolean> {
	const protectedRoots = await Promise.all(
		[live.root, live.backingRoot].map(
			async (root) => await realOrResolved(root),
		),
	);

	return written.some((target) =>
		protectedRoots.some((root) => pathIsWithin(target, root)),
	);
}

/**
 * The live install is what every session on this machine loads, so no edit
 * from the browser writes under it or its backing tree, however the linked
 * directory or the edited file reaches there.
 */
async function liveInstallRefusal(
	source: CorpusRoot,
	live: LiveCorpusRoot,
	path: string,
): Promise<string | null> {
	if (source.kind === "live") {
		return `The linked corpus is the live install, which every agent session on this machine loads as instructions, so edits to it belong where it is produced. Link a copy to edit with: ${LINK_CORPUS_COMMAND}`;
	}

	const written = await Promise.all(
		[source.root, join(source.root, path)].map(
			async (candidate) => await realOrResolved(candidate),
		),
	);

	return (await reachesLiveInstall(live, written))
		? LIVE_INSTALL_REFUSAL
		: null;
}
export { LIVE_INSTALL_REFUSAL, reachesLiveInstall, liveInstallRefusal };
