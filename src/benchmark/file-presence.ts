import type { Stats } from "node:fs";
import { lstat, readdir, rm, stat } from "node:fs/promises";

import serialMap from "./serial-map";

const REMOVAL_PASS_NUMBER_BASE = 1;

/**
 * Only a missing path may read as absent; any other failure (EACCES, EIO) must
 * surface. Reading a permission failure as absence would let a checkpoint
 * record partial state as truth and would refuse an unreadable corpus source
 * for a reason that is not the one it failed for.
 */
async function statIfExists(path: string): Promise<Stats | undefined> {
	try {
		return await stat(path);
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return undefined;
		}

		throw error;
	}
}

/**
 * The same rule as `statIfExists`, for a walk that must see a symlink rather
 * than what it points at. A directory readable but not searchable is the case
 * that separates the two failures: `readdir` lists its children and `lstat`
 * refuses them, so reading that refusal as absence would drop a real file from
 * a lineage that then reports itself complete.
 */
async function lstatIfPresent(path: string): Promise<Stats | undefined> {
	try {
		return await lstat(path);
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return undefined;
		}

		throw error;
	}
}

/** The same rule as `statIfExists`, for a directory's entry names. */
async function readdirIfPresent(path: string): Promise<string[] | undefined> {
	try {
		return await readdir(path);
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return undefined;
		}

		throw error;
	}
}

/** The same rule as `statIfExists`, for a file's text. */
async function textIfPresent(path: string): Promise<string | undefined> {
	try {
		return await Bun.file(path).text();
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return undefined;
		}

		throw error;
	}
}

async function pathExists(path: string): Promise<boolean> {
	return (await statIfExists(path)) !== undefined;
}

const REMOVAL_PASSES = 10;
const REMOVAL_BACKOFF_MS = 50;

/**
 * Removes a tree, and removes again while it is still there. Bun's recursive
 * rm can resolve while another remover of the same tree is still at work, so
 * a process that exits once one rm resolves can cut the other short and leave
 * part of the tree. A pass that runs while the other is still at work
 * resolves at once too, so each waits longer than the last. The passes are
 * bounded so a tree that something keeps refilling fails rather than spins.
 */
async function removeUntilAbsent(path: string): Promise<void> {
	for await (const inspection of serialMap(
		Array.from({ length: REMOVAL_PASSES }, (_value, index) => index).values(),
		async (pass) => {
			await rm(path, { force: true, recursive: true });
			return { pass, present: await pathExists(path) };
		},
	)) {
		const { pass, present } = inspection;
		if (!present) {
			return;
		}
		await Bun.sleep(REMOVAL_BACKOFF_MS * (pass + REMOVAL_PASS_NUMBER_BASE));
	}

	throw new Error(
		`${path} was still there after ${String(REMOVAL_PASSES)} removals`,
	);
}

/**
 * Why a path yields no bytes, as a clause that follows the path's own name.
 * One sentence per condition, wherever the condition is met: a layout entry a
 * walk refuses and an instruction file a report refuses are the same fact about
 * the same kind of path, and a reader who meets it twice should read it once.
 */
const MISSING_TARGET_REASON =
	"is a link whose target is missing, so the bytes it names cannot be read";

const REFUSED_READ_REASONS = new Map([
	["ELOOP", "is a link that never resolves to a file, so it names no bytes"],
	["EACCES", "cannot be read, so its bytes cannot be hashed"],
	["EPERM", "cannot be read, so its bytes cannot be hashed"],
	[
		"ENOTDIR",
		"lies under a file rather than a directory, so it names no bytes",
	],
]);

/**
 * The clause for a failure a read raised, or `undefined` for one this
 * vocabulary does not name. A caller that has already classified an entry still
 * needs this: which syscall reports a hostile entry is the filesystem's choice,
 * not the caller's, and `EACCES` has been observed from `lstat` on one
 * filesystem and from `realpath` on another for the same planted file.
 *
 * `about` is the path whose refusal is being decided, and a failure naming a
 * different one is not it. Resolving where a live corpus entry may point
 * consults the configured backing tree, so a backing tree that loops or cannot
 * be read fails a probe of a perfectly readable file; refusing that file would
 * state something false about it and hide the configuration that is actually
 * broken. Pass `undefined` where the failure may legitimately name another
 * path: a recursive listing fails on the entry that broke it, never on the
 * directory it was handed.
 */
function refusedEntryReason(
	error: Readonly<Error>,
	about?: string,
): string | undefined {
	if (!("code" in error)) {
		return undefined;
	}

	const named = "path" in error ? String(error.path) : undefined;
	if (about !== undefined && named !== undefined && named !== about) {
		return undefined;
	}

	return REFUSED_READ_REASONS.get(String(error.code));
}

/**
 * What a path holds, for a caller about to read its bytes. `refused` is the
 * answer that cannot become bytes however the caller asks; `directory` and
 * `irregular` are states whose meaning is the caller's: a recursive walk skips
 * both, while a declared file refuses them.
 */
type ClassifiedEntry =
	| { readonly kind: "absent" }
	| { readonly kind: "file" }
	| { readonly kind: "directory" }
	| { readonly kind: "irregular" }
	| { readonly kind: "refused"; readonly reason: string };

type EntryStatsReading =
	| { readonly kind: "stats"; readonly stats: Stats | undefined }
	| { readonly kind: "refused"; readonly reason: string };

async function readEntryStats(
	path: string,
	read: (path: string) => Promise<Stats | undefined>,
): Promise<EntryStatsReading> {
	try {
		return { kind: "stats", stats: await read(path) };
	} catch (error) {
		const reason =
			error instanceof Error ? refusedEntryReason(error, path) : undefined;
		if (reason === undefined) {
			throw error;
		}

		return { kind: "refused", reason };
	}
}

/**
 * The one place that decides what a path is before anything reads it, so the
 * walk, the corpus report, and a declared file's hash cannot disagree about
 * which states hold bytes and which are refused by name.
 *
 * A path `lstat` cannot see is absent, and a link whose target `stat` cannot
 * see is refused: the difference matters to a walk, where the first is an entry
 * another process removed mid-walk and the second is a declared file that was
 * never hashed. A path that is neither a link nor there is read as absent too,
 * since a dangling-link sentence about a plain file would send its reader after
 * a link that does not exist.
 *
 * Nothing here opens the path. A pipe with no writer blocks its reader forever,
 * so a report that classified it first returns instead of hanging.
 */
async function classifyEntry(path: string): Promise<ClassifiedEntry> {
	const linkReading = await readEntryStats(path, lstatIfPresent);
	if (linkReading.kind === "refused") {
		return linkReading;
	}
	const link = linkReading.stats;
	if (link === undefined) {
		return { kind: "absent" };
	}

	const targetReading = await readEntryStats(path, statIfExists);
	return classifyVisibleTarget({ link, targetReading });
}

interface VisibleEntryTarget {
	readonly link: Readonly<Pick<Stats, "isSymbolicLink">>;
	readonly targetReading:
		| { readonly kind: "refused"; readonly reason: string }
		| {
				readonly kind: "stats";
				readonly stats:
					| Readonly<Pick<Stats, "isDirectory" | "isFile">>
					| undefined;
		  };
}
function classifyVisibleTarget({
	link,
	targetReading,
}: VisibleEntryTarget): ClassifiedEntry {
	if (targetReading.kind === "refused") {
		return targetReading;
	}
	const target = targetReading.stats;
	if (target === undefined) {
		return link.isSymbolicLink()
			? { kind: "refused", reason: MISSING_TARGET_REASON }
			: { kind: "absent" };
	}

	if (target.isDirectory()) {
		return { kind: "directory" };
	}

	return target.isFile() ? { kind: "file" } : { kind: "irregular" };
}

/**
 * Bytes reached through a link that leaves the tree the caller named are
 * refused, whether the walk saw the link or a containment check resolved it.
 * One planted link produces one error type across every surface, so a caller
 * translating it into a refused precondition catches one name.
 */
class SymlinkedEntryError extends Error {
	public override name = "SymlinkedEntryError";
}

export {
	statIfExists,
	lstatIfPresent,
	readdirIfPresent,
	textIfPresent,
	pathExists,
	removeUntilAbsent,
	refusedEntryReason,
	classifyEntry,
	SymlinkedEntryError,
};
export type { ClassifiedEntry };
