import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const SESSION_FILE_SUFFIX = ".jsonl";

function claudeProjectsDirectory(): string {
	return join(homedir(), ".claude", "projects");
}

/**
 * The project slug is the working directory's real path with every separator
 * replaced by a dash, which is how the provider names the directory it writes
 * a session file into.
 */
function projectSlug(realPath: string): string {
	return realPath.replaceAll("/", "-");
}

/**
 * Every transcript under a directory, however deep. The provider files its
 * sessions by the slug of the directory each ran in, and a capture may name a
 * session that ran anywhere, so the search covers the whole tree rather than
 * asking the caller which slug to look in.
 *
 * A store that was never written holds no sessions rather than failing the
 * search, the same reading `run-layout` gives a run directory that does not
 * exist: a machine that has run the harness but never a session of its own has
 * no interactive store, and its saved attempts are still capturable.
 */
async function transcriptsUnder(directory: string): Promise<readonly string[]> {
	try {
		const entries = await readdir(directory, { recursive: true });

		return entries
			.filter((entry) => entry.endsWith(SESSION_FILE_SUFFIX))
			.map((entry) => join(directory, entry));
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return [];
		}

		throw error;
	}
}
export { claudeProjectsDirectory, projectSlug, transcriptsUnder };
export { default as CaptureError } from "./session-capture-contract";
export type {
	ResolvedSession,
	CapturedPrefix,
} from "./session-capture-contract";
export { default as resolveSessionFile } from "./session-transcript-identity";
export { default as captureTranscriptPrefix } from "./session-captured-prefix";
