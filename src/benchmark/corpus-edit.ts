import { randomUUID } from "node:crypto";
import { chmod, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { CorpusRoot, LiveCorpusRoot } from "./corpus-file";
import { rowsAnEditInvalidates } from "./corpus-invalidation";
import { hashCorpusLayout } from "./corpus-layout";
import type { HashedLayout } from "./corpus-layout";
import { corpusVersionDigest, measureCorpusVersion } from "./corpus-version";
import { RefusedPreconditionError } from "./exit-codes";
import { pathIsWithin } from "./path-containment";
import { LINK_CORPUS_COMMAND } from "./settings";

/** New text for one file the corpus report lists. */
export interface CorpusEdit {
	readonly path: string;
	readonly text: string;
}

/** What applying an edit would do, read before anything is written. */
export interface CorpusEditReview {
	/** The version of the corpus under test the edit starts from. */
	readonly startsFrom: string;
	/** The run-history rows the edit would mark stale. */
	readonly invalidated: readonly string[];
	/** Why an apply of this edit would be refused, read before it is tried. */
	readonly applyRefusal: string | null;
}

export interface AppliedCorpusEdit {
	readonly previous: string;
	readonly version: string;
	readonly invalidated: readonly string[];
}

interface EditedLayout {
	readonly layout: HashedLayout;
	readonly startsFrom: string;
	readonly bytes: Readonly<Uint8Array>;
}

async function editedLayout(
	source: CorpusRoot,
	edit: CorpusEdit,
): Promise<EditedLayout> {
	const layout = await hashCorpusLayout(source);

	return {
		layout,
		startsFrom: corpusVersionDigest(layout.files),
		bytes: new TextEncoder().encode(edit.text),
	};
}

function invalidatedBy(
	recordsDirectory: string,
	source: CorpusRoot,
	edit: CorpusEdit,
	edited: EditedLayout,
): Promise<readonly string[]> {
	return rowsAnEditInvalidates(
		recordsDirectory,
		source,
		edited.layout.files.map(({ path }) => path),
		{ path: edit.path, bytes: edited.bytes },
	);
}

/** The real path, or the resolved one for a path that does not exist yet. */
function realOrResolved(path: string): Promise<string> {
	return realpath(path).catch(() => resolve(path));
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
		return `The linked corpus is the live install, which no edit from here changes. Link a copy to edit with: ${LINK_CORPUS_COMMAND}`;
	}
	const written = await Promise.all(
		[source.root, join(source.root, path)].map((candidate) =>
			realOrResolved(candidate),
		),
	);
	const protectedRoots = await Promise.all(
		[live.root, live.backingRoot].map((root) => realOrResolved(root)),
	);
	const reachesLive = written.some((target) =>
		protectedRoots.some((root) => pathIsWithin(target, root)),
	);

	return reachesLive
		? `The linked corpus directory resolves into the live install, which no edit from here changes. Link a copy to edit with: ${LINK_CORPUS_COMMAND}`
		: null;
}

export async function reviewCorpusEdit(
	recordsDirectory: string,
	corpus: { readonly source: CorpusRoot; readonly live: LiveCorpusRoot },
	edit: CorpusEdit,
): Promise<CorpusEditReview> {
	const { source, live } = corpus;
	const edited = await editedLayout(source, edit);

	return {
		startsFrom: edited.startsFrom,
		invalidated: await invalidatedBy(recordsDirectory, source, edit, edited),
		applyRefusal: await liveInstallRefusal(source, live, edit.path),
	};
}

/**
 * Written to a temporary file at the corpus root, outside every layout
 * directory a measurement walks, and renamed over the file, so no reader sees
 * a torn body. The file keeps its mode, which the version digest does not
 * hold.
 */
async function replaceFile(
	root: string,
	file: string,
	bytes: Readonly<Uint8Array>,
): Promise<void> {
	const { mode } = await stat(file);
	const temporary = join(root, `.rehearse-edit-${randomUUID()}.tmp`);
	try {
		await writeFile(temporary, bytes);
		await chmod(temporary, mode);
		await rename(temporary, file);
	} finally {
		await rm(temporary, { force: true });
	}
}

export async function applyCorpusEdit(
	recordsDirectory: string,
	corpus: { readonly source: CorpusRoot; readonly live: LiveCorpusRoot },
	edit: CorpusEdit & { readonly startsFrom: string },
): Promise<AppliedCorpusEdit> {
	const { source, live } = corpus;
	const refusal = await liveInstallRefusal(source, live, edit.path);
	if (refusal !== null) {
		throw new RefusedPreconditionError(refusal);
	}
	const edited = await editedLayout(source, edit);
	await measureCorpusVersion(recordsDirectory, source);
	const invalidated = await invalidatedBy(
		recordsDirectory,
		source,
		edit,
		edited,
	);

	await replaceFile(source.root, join(source.root, edit.path), edited.bytes);

	const measured = await measureCorpusVersion(recordsDirectory, source);
	if (measured.kind === "refused") {
		throw new Error(
			`The edit was applied, and the corpus no longer measures: ${measured.refusal}`,
		);
	}

	return {
		previous: edited.startsFrom,
		version: measured.digest,
		invalidated,
	};
}
