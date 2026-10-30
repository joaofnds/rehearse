import { cp, mkdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import type { DirectoryCorpusRoot, LiveCorpusRoot } from "./corpus-file";
import { isCorpusLayoutPath } from "./corpus-file";
import type { ResolvedCorpusSource } from "./corpus-source";
import { corpusLayoutEntries } from "./corpus-source";
import { SessionCorpusError, refuseSymlinks } from "./session-corpus-links";
import { holds, overlaidRoots } from "./session-corpus-overlay";
import type { CorpusSnapshotOrigin } from "./session-record";

const EMPTY_COLLECTION_LENGTH = 0;

/**
 * The one directory a session attempt's corpus bytes are read from, for
 * hashing and for installing alike. Its shape is corpus layout, so a reader
 * cannot tell whether the bytes were copied or already installed.
 * It carries the paths the case declared, which select the output style and
 * are hashed into lineage. Its scope says what an attempt installs from it: the
 * declared files alone for an isolated case, and the whole corpus for a case
 * that runs with the user's actual setup, whose session would otherwise see
 * none of the user's other instruction files.
 */
interface SessionCorpusSnapshotFields {
	readonly origin: CorpusSnapshotOrigin;
	readonly declaredPaths: readonly string[];
	readonly scope: "declared" | "whole";
}

type SessionCorpusSnapshot = SessionCorpusSnapshotFields &
	(LiveCorpusRoot | DirectoryCorpusRoot);

/**
 * A stage's corpus is the skill it invokes, so a stage cannot run against a
 * corpus source at all: there is no second skill for a source to supply. A
 * session case is where a corpus variant is measured.
 */
function stageCorpusRefusal(corpus: string): SessionCorpusError {
	return new SessionCorpusError(
		`A stage's corpus is the skill it invokes, so --corpus ${corpus} cannot reach it`,
	);
}

function originOf(source: ResolvedCorpusSource): CorpusSnapshotOrigin {
	if (source.kind === "directory") {
		return { kind: "directory", source: source.root };
	}

	return { kind: "live" };
}

/**
 * A live install is snapshotted by naming it rather than by copying it: a copy
 * would change the resolved paths every record before `--corpus` carries, for
 * bytes nothing installs. A declared file the attempt must *overlay* is the
 * exception, because `installSessionCorpusSnapshot` installs from a directory
 * snapshot only: left as a pointer, a declared skill or instruction file would
 * be hashed into lineage and then never delivered, and the attempt would
 * measure whatever the operator's install said at read time. Those paths are
 * copied once, when the snapshot is taken; the undeclared rest of the install
 * is left untouched.
 */
async function snapshotSessionCorpus(
	source: ResolvedCorpusSource,
	destination: string,
	declaredPaths: readonly string[],
): Promise<SessionCorpusSnapshot> {
	if (
		source.kind === "live" &&
		!declaredPaths.some((layoutPath) => isCorpusLayoutPath(layoutPath))
	) {
		return {
			backingRoot: source.backingRoot,
			declaredPaths: [...declaredPaths],
			kind: "live",
			origin: originOf(source),
			root: source.root,
			scope: "declared",
		};
	}

	return await freezeSessionCorpus(source, destination, declaredPaths);
}

/**
 * A confirmation group cannot keep a live corpus pointer: every repetition
 * must read the bytes captured before the first provider call. This always
 * copies the declared corpus files and retains the original source only as
 * provenance, so the snapshot a reader gets back is byte-addressed by the
 * harness rather than by whatever the source still holds.
 */
async function freezeSessionCorpus(
	source: ResolvedCorpusSource,
	destination: string,
	declaredPaths: readonly string[],
): Promise<SessionCorpusSnapshot> {
	await copyRoots(source, destination, overlaidRoots(declaredPaths));

	return {
		declaredPaths: [...declaredPaths],
		kind: "directory",
		origin: originOf(source),
		root: destination,
		scope: "declared",
	};
}

/**
 * Under the actual setup the session loads no user-level instruction file, so
 * an arm reaches its session only through what the attempt installs. Copying
 * the whole corpus, not only the declared files, is what lets the live arm
 * stand for the user's install and a candidate differ from it only where it
 * was edited.
 */
async function freezeWholeSessionCorpus(
	source: ResolvedCorpusSource,
	destination: string,
	declaredPaths: readonly string[],
): Promise<SessionCorpusSnapshot> {
	const entries = await corpusLayoutEntries(source);
	await copyRoots(
		source,
		destination,
		entries.map(({ layoutPath }) => layoutPath),
	);

	return {
		declaredPaths: [...declaredPaths],
		kind: "directory",
		origin: originOf(source),
		root: destination,
		scope: "whole",
	};
}

async function copyRoots(
	source: ResolvedCorpusSource,
	destination: string,
	roots: readonly string[],
): Promise<void> {
	const entries = await corpusLayoutEntries(source);
	await mkdir(destination, { recursive: true });

	await Array.fromAsync(entries, async (entry) => {
		const carried = roots.filter((root) => holds(entry.layoutPath, root));
		if (carried.length === EMPTY_COLLECTION_LENGTH) {
			return;
		}

		await refuseSymlinks(source, entry);

		await Array.fromAsync(carried, async (root) => {
			const target = join(destination, root);
			await mkdir(dirname(target), { recursive: true });
			await cp(
				join(entry.sourcePath, relative(entry.layoutPath, root)),
				target,
				{ dereference: true, recursive: true },
			);
		});
	});
}

export { SessionCorpusError } from "./session-corpus-links";
export {
	stageCorpusRefusal,
	snapshotSessionCorpus,
	freezeSessionCorpus,
	freezeWholeSessionCorpus,
};
export type { SessionCorpusSnapshot };
export {
	installSessionCorpusSnapshot,
	deliversCorpusFile,
	snapshotStyleName,
} from "./session-corpus-overlay";
