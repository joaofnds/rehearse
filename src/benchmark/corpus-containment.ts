import { realpath } from "node:fs/promises";
import { sep } from "node:path";

import { unhandled } from "./contracts";
import CorpusConfigurationError from "./corpus-configuration";
import type { CorpusRoot } from "./corpus-path";
import type { ClassifiedEntry } from "./file-presence";
import {
	SymlinkedEntryError,
	refusedEntryReason,
	statIfExists,
} from "./file-presence";

type ContainmentReading =
	| { readonly kind: "resolved"; readonly outside: boolean }
	| { readonly kind: "refused"; readonly reason: string };

/**
 * A declared path that lands inside the root can still be a link, or sit under
 * a linked directory, and opening it reads bytes the corpus does not hold while
 * filing them under a path that says it does. `withoutTraversal` is lexical and never
 * resolves a link; an `lstat` on the leaf sees a link one level down but not an
 * intermediate directory that is one. Only resolving every component answers it,
 * and both sides get resolved because macOS resolves `/tmp` to `/private/tmp`,
 * so comparing a resolved path against a raw root rejects everything under it.
 *
 * A live source may resolve within its separately declared backing tree. That
 * permission is carried by the source, rather than discovered from its links,
 * so an escaping link cannot authorize its own target.
 */
async function resolvesOutside(
	root: string,
	absolute: string,
): Promise<boolean> {
	const resolvedRoot = await realpath(root);
	const resolvedPath = await realpath(absolute);

	return (
		resolvedPath !== resolvedRoot &&
		!resolvedPath.startsWith(`${resolvedRoot}${sep}`)
	);
}

async function resolvesOutsideCorpus(
	source: CorpusRoot,
	absolute: string,
): Promise<boolean> {
	if (!(await resolvesOutside(source.root, absolute))) {
		return false;
	}

	if (source.kind === "directory") {
		return true;
	}

	const backing = await statIfExists(source.backingRoot);
	if (backing === undefined) {
		return true;
	}

	if (!backing.isDirectory()) {
		throw new CorpusConfigurationError(
			`Live corpus backing root ${source.backingRoot} is not a directory`,
		);
	}

	return await resolvesOutside(source.backingRoot, absolute);
}

/**
 * The refusal containment makes, or `undefined` when the path is contained.
 *
 * Resolving the path touches the file itself, so a filesystem that answered the
 * `stat` pair can still refuse this: an unreadable regular file has been
 * observed refusing `realpath` after `classifyEntry` called it a file. A path
 * whose real location cannot be established is refused for that reason, since
 * the question this asks about it has no answer.
 *
 * A failure naming anything else is not this file's refusal and surfaces
 * unchanged. A live source's authorization consults the configured backing
 * tree, and a backing tree that loops or cannot be read is a configuration
 * failure the operator has to see as one.
 */
async function uncontainedRefusal(
	source: CorpusRoot,
	layoutPath: string,
	absolute: string,
): Promise<string | undefined> {
	const readContainment = async (): Promise<ContainmentReading> => {
		try {
			return {
				kind: "resolved",
				outside: await resolvesOutsideCorpus(source, absolute),
			};
		} catch (error) {
			const reason =
				error instanceof Error
					? refusedEntryReason(error, absolute)
					: undefined;
			if (reason === undefined) {
				throw error;
			}

			return { kind: "refused", reason: corpusFileRefusal(layoutPath, reason) };
		}
	};

	const outside = await readContainment();
	if (outside.kind === "refused") {
		return outside.reason;
	}

	if (!outside.outside) {
		return undefined;
	}

	return source.kind === "live"
		? `Corpus file ${layoutPath} resolves outside the live corpus extent, which would hash bytes the corpus does not hold`
		: `Corpus file ${layoutPath} resolves outside the corpus source, which would hash bytes the corpus does not hold`;
}

async function refuseUncontained(
	source: CorpusRoot,
	layoutPath: string,
	absolute: string,
): Promise<void> {
	const refusal = await uncontainedRefusal(source, layoutPath, absolute);
	if (refusal !== undefined) {
		throw new SymlinkedEntryError(refusal);
	}
}

/**
 * What a corpus file cannot yield, named for the reader of a report: the state
 * `classifyEntry` refused, or a path that is there and holds no bytes anyway.
 * A directory and an irregular entry are refused here and skipped by a
 * recursive walk, because a declared file names bytes the corpus promised
 * while a walk is only enumerating what it finds.
 */
function corpusFileRefusal(layoutPath: string, reason: string): string {
	return `Corpus file ${layoutPath} ${reason}`;
}

function refusalForEntry(
	layoutPath: string,
	classified: ClassifiedEntry,
): string | undefined {
	switch (classified.kind) {
		case "refused": {
			return corpusFileRefusal(layoutPath, classified.reason);
		}
		case "directory": {
			return corpusFileRefusal(
				layoutPath,
				"is a directory, so it holds no bytes to hash",
			);
		}
		case "irregular": {
			return corpusFileRefusal(
				layoutPath,
				"is not a regular file, so it holds no bytes to hash",
			);
		}
		case "absent":
		case "file": {
			return undefined;
		}
		default: {
			return unhandled(classified, "corpus entry classification");
		}
	}
}

export {
	resolvesOutside,
	resolvesOutsideCorpus,
	uncontainedRefusal,
	refuseUncontained,
	corpusFileRefusal,
	refusalForEntry,
};
export type { ContainmentReading };
