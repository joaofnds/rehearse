import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import { hashFile } from "./checkpoint-lineage";
import type { CorpusRoot } from "./corpus-file";
import { resolvesOutside, resolvesOutsideCorpus } from "./corpus-file";
import {
	SymlinkedEntryError,
	classifyEntry,
	lstatIfPresent,
	refusedEntryReason,
} from "./file-presence";

const ESCAPES_TREE_REASON =
	"resolves outside the tree it is named under, so its bytes are not the ones that tree holds";

/**
 * The path is named the way the hashes are, `join(prefix, entry)`, because the
 * corpus screen redacts the absolute root before a reader sees the message. An
 * entry named alone leaves that reader knowing something called `escape.md` is
 * a link, with no way to tell which layout directory holds it.
 */
function symlinkedEntry(path: string): SymlinkedEntryError {
	return refusedEntry(path, ESCAPES_TREE_REASON);
}

/**
 * A refusal naming the entry and the reason it was refused for, so every
 * refusal in one list reads as one kind of statement whether the entry escaped
 * the tree or could not be read at all.
 */
function refusedEntry(path: string, reason: string): SymlinkedEntryError {
	return new SymlinkedEntryError(`${path} ${reason}`);
}

type Probed<Value> = { readonly value: Value } | { readonly reason: string };

/**
 * A probe of one entry whose failure this walk can name. Classifying the entry
 * is not enough on its own: resolving where it leads and reading its bytes both
 * touch the entry again, and a filesystem may refuse either after allowing the
 * `stat` pair. An unreadable regular file has been observed answering `lstat`
 * and `stat` and then refusing `realpath`, so a code `refusedEntryReason` knows
 * becomes this entry's refusal wherever it surfaces, as long as the failure is
 * about this entry and not about something else the probe had to consult.
 */
async function probed<Value>(
	path: string,
	work: () => Promise<Value>,
): Promise<Probed<Value>> {
	try {
		return { value: await work() };
	} catch (error) {
		const reason =
			error instanceof Error ? refusedEntryReason(error, path) : undefined;
		if (reason === undefined) {
			throw error;
		}

		return { reason };
	}
}

/**
 * Every path under the tree, relative to it, or the refusal listing them
 * raised. A recursive listing opens each entry to decide whether to descend, so
 * one self-referential link refuses the listing whole and no per-entry check
 * ever runs: the tree is enumerated or it is not.
 *
 * The refusal names the entry the failure identifies, since that is the file
 * whoever reads it has to go fix, and falls back to the tree when the failure
 * names nothing under it. Unlike an entry refused mid-walk, this one takes its
 * tree's files with it, because a listing that failed reports no file at all:
 * the digest is withheld for either refusal, so neither serves a partial tree
 * as a whole one.
 */
async function listedEntries(
	root: string,
	prefix: string,
): Promise<Probed<string[]>> {
	try {
		return { value: await readdir(root, { recursive: true }) };
	} catch (error) {
		if (!(error instanceof Error)) {
			throw error;
		}

		const reason = refusedEntryReason(error);
		if (reason === undefined) {
			throw error;
		}

		return { reason: `${listedEntryPath(error, root, prefix)} ${reason}` };
	}
}

function listedEntryPath(
	error: Readonly<Error>,
	root: string,
	prefix: string,
): string {
	const path = "path" in error ? String(error.path) : "";
	const entry = path.startsWith(`${root}${sep}`)
		? relative(root, path)
		: undefined;

	return entry === undefined ? prefix || root : join(prefix, entry);
}

async function refuseIfLink(root: string, prefix: string): Promise<void> {
	const stats = await lstatIfPresent(root);
	if (stats?.isSymbolicLink() === true) {
		throw symlinkedEntry(prefix === "" ? root : prefix);
	}
}

/**
 * What one listed entry contributes: bytes under its own path, a refusal the
 * walk names it by, or nothing. A directory is skipped because the listing
 * already carries its children, and anything that is neither a directory nor a
 * regular file holds no bytes to hash.
 */
type WalkedEntry =
	| { readonly skipped: true }
	| { readonly refused: string }
	| { readonly sha256: string };

interface EntryContainment {
	readonly root: string;
	readonly absolute: string;
	readonly options: DirectoryWalkOptions;
}

async function containmentRefusal({
	root,
	absolute,
	options,
}: EntryContainment): Promise<string | undefined> {
	const outside = await probed(
		absolute,
		async () =>
			await ("source" in options
				? resolvesOutsideCorpus(options.source, absolute)
				: resolvesOutside(root, absolute)),
	);
	if ("reason" in outside) {
		return outside.reason;
	}

	if (outside.value) {
		return ESCAPES_TREE_REASON;
	}

	return undefined;
}

async function walkedEntry(
	root: string,
	absolute: string,
	options: DirectoryWalkOptions,
): Promise<WalkedEntry> {
	const classified = await classifyEntry(absolute);
	if (classified.kind === "absent" || classified.kind === "refused") {
		return classified.kind === "absent"
			? { skipped: true }
			: { refused: classified.reason };
	}

	const refusal = await containmentRefusal({ absolute, options, root });
	if (refusal !== undefined) {
		return { refused: refusal };
	}

	if (classified.kind !== "file") {
		return { skipped: true };
	}

	const hashed = await probed(absolute, async () => await hashFile(absolute));

	return "reason" in hashed
		? { refused: hashed.reason }
		: { sha256: hashed.value };
}

type DirectoryWalkOptions =
	| { readonly source: CorpusRoot }
	| { readonly rootMayBeALink: boolean };
export {
	symlinkedEntry,
	refuseIfLink,
	listedEntries,
	walkedEntry,
	refusedEntry,
};
export type { DirectoryWalkOptions };
