import { randomUUID } from "node:crypto";
import { link, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { CorpusRoot } from "./corpus-file";
import { logDirectory } from "./corpus-version-storage";
import { readdirIfPresent, textIfPresent } from "./file-presence";
import claimedNumbers from "./numbered-claims";

const CORPUS_POSITION_STEP = 1;

const NO_PREVIOUS_CORPUS_VERSIONS = 0;

const FINAL_CORPUS_VERSION_OFFSET = -1;

interface LogEntry {
	readonly position: number;
	readonly digest: string;
}

async function readLog(directory: string): Promise<LogEntry[]> {
	const entries: LogEntry[] = [];
	await Array.fromAsync(
		claimedNumbers((await readdirIfPresent(directory)) ?? []),
		async (position) => {
			const text = await textIfPresent(join(directory, String(position)));
			if (text !== undefined) {
				entries.push({ digest: text.trim(), position });
			}
		},
	);

	return entries;
}

/** Each collision needs a fresh log before choosing another position. */
async function* logSnapshots(directory: string): AsyncGenerator<LogEntry[]> {
	while (true) {
		yield readLog(directory);
	}
}

/**
 * An entry is linked into place from a file already holding its digest, so
 * the create is exclusive and no reader sees an empty entry. A writer that
 * loses the race re-reads the log before trying again, which is what keeps
 * two measurements of one new state to one entry. The next position follows
 * the highest one present rather than the count, so a missing entry never
 * leaves a writer retrying a position that is already taken.
 */
async function appendToLog(directory: string, digest: string): Promise<void> {
	await mkdir(directory, { recursive: true });
	const temporary = join(directory, `${randomUUID()}.tmp`);
	await writeFile(temporary, `${digest}\n`);

	try {
		for await (const log of logSnapshots(directory)) {
			const latest = log.at(FINAL_CORPUS_VERSION_OFFSET);
			if (
				latest?.digest === digest ||
				(await claimLogEntry(temporary, directory, latest))
			) {
				return;
			}
		}
	} finally {
		await rm(temporary, { force: true });
	}
}

/** The versions one source has been measured at, oldest first. */
async function corpusVersionLog(
	recordsDirectory: string,
	source: CorpusRoot,
): Promise<readonly string[]> {
	const entries = await readLog(await logDirectory(recordsDirectory, source));

	return entries.map(({ digest }) => digest);
}

async function claimLogEntry(
	temporary: string,
	directory: string,
	latest: LogEntry | undefined,
): Promise<boolean> {
	try {
		await link(
			temporary,
			join(
				directory,
				String(
					(latest?.position ?? NO_PREVIOUS_CORPUS_VERSIONS) +
						CORPUS_POSITION_STEP,
				),
			),
		);

		return true;
	} catch (error) {
		if (
			!(error instanceof Error && "code" in error && error.code === "EEXIST")
		) {
			throw error;
		}
	}
	return false;
}
export { appendToLog, corpusVersionLog };
