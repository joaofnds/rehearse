import { readdir, realpath, stat } from "node:fs/promises";
import { join, relative } from "node:path";

import type { LiveCorpusRoot } from "./corpus-file";
import {
	CORPUS_INSTRUCTIONS_PATH,
	isCorpusLayoutPath,
	resolvesOutsideCorpus,
} from "./corpus-file";
import type { CorpusLayoutEntry, ResolvedCorpusSource } from "./corpus-source";
import serialMap from "./serial-map";

class SessionCorpusError extends Error {
	public override name = "SessionCorpusError";
}

/**
 * A recursive copy dereferences, so an entry reached through a link copies bytes
 * from outside the source: the harness would hash and install whatever the link
 * points at while the record says it snapshotted a source. Containment of every
 * resolved path is what answers it, because the link can be the entry itself,
 * any directory above it, or an entry nested beneath a linked directory.
 */
async function refuseSymlinks(
	source: ResolvedCorpusSource,
	entry: CorpusLayoutEntry,
): Promise<void> {
	if (await resolvesOutsideCorpus(source, entry.sourcePath)) {
		throw symlinkedCorpusEntry(source, entry.layoutPath);
	}

	const stats = await stat(entry.sourcePath);
	if (!stats.isDirectory()) {
		await refuseOutsideLayout(source, entry);
		return;
	}

	await refuseNestedSymlinks(source, entry, new Set());
}

async function refuseNestedSymlinks(
	source: ResolvedCorpusSource,
	directory: CorpusLayoutEntry,
	visitedDirectories: Set<string>,
): Promise<void> {
	const resolvedDirectory = await realpath(directory.sourcePath);
	if (visitedDirectories.has(resolvedDirectory)) {
		return;
	}

	visitedDirectories.add(resolvedDirectory);

	await Array.fromAsync(await readdir(directory.sourcePath), async (name) => {
		const child = {
			layoutPath: join(directory.layoutPath, name),
			sourcePath: join(directory.sourcePath, name),
		};
		if (await resolvesOutsideCorpus(source, child.sourcePath)) {
			throw symlinkedCorpusEntry(source, child.layoutPath);
		}

		const sourceStats = await stat(child.sourcePath);

		if (sourceStats.isDirectory()) {
			await refuseNestedSymlinks(source, child, visitedDirectories);
			return;
		}

		await refuseOutsideLayout(source, child);
	});
}

/**
 * A live corpus root is the operator's whole install, so containment within it
 * is not enough for a nested entry: `~/.claude` also holds credentials, saved
 * transcripts and settings, and a live copy dereferences. An entry reached
 * through a link must land in corpus layout, which is the only part of that
 * install a case declares. The live instructions file is the one exception
 * that may land anywhere in the backing tree, which holds no credentials. A
 * directory source resolves against its own root, so this only binds the live
 * branch.
 */
async function refuseOutsideLayout(
	source: ResolvedCorpusSource,
	entry: CorpusLayoutEntry,
): Promise<void> {
	if (source.kind !== "live") {
		return;
	}

	const resolved = await realpath(entry.sourcePath);
	if (
		(await isInstructionsInBackingTree(source, entry, resolved)) ||
		(await landsInLayout(source, resolved))
	) {
		return;
	}

	throw symlinkedCorpusEntry(source, entry.layoutPath);
}

async function resolvedRoot(root: string): Promise<string | undefined> {
	try {
		return await realpath(root);
	} catch {
		return undefined;
	}
}

async function landsInLayout(
	source: LiveCorpusRoot,
	resolved: string,
): Promise<boolean> {
	for await (const root of serialMap(
		[source.root, source.backingRoot].values(),
		resolvedRoot,
	)) {
		if (root !== undefined) {
			const layoutPath = relative(root, resolved);
			if (!layoutPath.startsWith("..") && isCorpusLayoutPath(layoutPath)) {
				return true;
			}
		}
	}

	return false;
}

async function isInstructionsInBackingTree(
	source: LiveCorpusRoot,
	entry: CorpusLayoutEntry,
	resolved: string,
): Promise<boolean> {
	if (entry.layoutPath !== CORPUS_INSTRUCTIONS_PATH) {
		return false;
	}

	const backingRoot = await resolvedRoot(source.backingRoot);

	return (
		backingRoot !== undefined &&
		!relative(backingRoot, resolved).startsWith("..")
	);
}

/**
 * The live wording matches `corpus-file.ts`'s, because an operator who reaches
 * this refusal through a live install needs to be told the extent includes the
 * backing tree: "outside the corpus source" reads as a source they never named.
 */
function symlinkedCorpusEntry(
	source: ResolvedCorpusSource,
	layoutPath: string,
): SessionCorpusError {
	const extent =
		source.kind === "live" ? "the live corpus extent" : "the corpus source";

	return new SessionCorpusError(
		`Corpus entry ${layoutPath} resolves outside ${extent}, which would snapshot bytes the corpus does not hold`,
	);
}

export { SessionCorpusError, refuseSymlinks };
