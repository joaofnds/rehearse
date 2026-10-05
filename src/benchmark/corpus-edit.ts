import { randomUUID } from "node:crypto";
import {
	chmod,
	readFile,
	realpath,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import type { CorpusRoot, LiveCorpusRoot } from "./corpus-file";
import { rowsAnEditInvalidates } from "./corpus-invalidation";
import { hashCorpusLayout } from "./corpus-layout";
import type { HashedLayout } from "./corpus-layout";
import { corpusVersionDigest, measureCorpusVersion } from "./corpus-version";
import { RefusedPreconditionError } from "./exit-codes";
import { pathIsWithin } from "./path-containment";
import { LINK_CORPUS_COMMAND } from "./settings";

/** The edited path is not one of the files the corpus report lists. */
export class UnlistedCorpusFileError extends Error {
	public override name = "UnlistedCorpusFileError";
}

/** The linked corpus an edit writes to, and the live install it never may. */
export interface EditedCorpus {
	readonly source: CorpusRoot;
	readonly live: LiveCorpusRoot;
}

/** New text for one file the corpus report lists. */
export interface CorpusEdit {
	readonly path: string;
	readonly text: string;
}

/** What applying an edit would do, read before anything is written. */
/** An edit, carrying the version its review read. */
export interface ReviewedCorpusEdit extends CorpusEdit {
	readonly startsFrom: string;
}

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
	if (layout.refusals.length > 0) {
		throw new RefusedPreconditionError(
			`The linked corpus does not measure: ${layout.refusals.join("; ")}`,
		);
	}

	if (!layout.files.some(({ path }) => path === edit.path)) {
		throw new UnlistedCorpusFileError(
			`The corpus report lists no file ${edit.path}`,
		);
	}

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

const LIVE_INSTALL_REFUSAL = `The linked corpus directory resolves into the live install, which no edit from here changes. Link a copy to edit with: ${LINK_CORPUS_COMMAND}`;

/** Whether any of the real paths lies under the live install's real roots. */
async function reachesLiveInstall(
	live: LiveCorpusRoot,
	written: readonly string[],
): Promise<boolean> {
	const protectedRoots = await Promise.all(
		[live.root, live.backingRoot].map((root) => realOrResolved(root)),
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
		return `The linked corpus is the live install, which no edit from here changes. Link a copy to edit with: ${LINK_CORPUS_COMMAND}`;
	}

	const written = await Promise.all(
		[source.root, join(source.root, path)].map((candidate) =>
			realOrResolved(candidate),
		),
	);

	return (await reachesLiveInstall(live, written))
		? LIVE_INSTALL_REFUSAL
		: null;
}

export async function reviewCorpusEdit(
	recordsDirectory: string,
	corpus: EditedCorpus,
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
 * Written to a temporary file and renamed over the file's real path, so no
 * reader sees a torn body and a linked file is replaced where it lives rather
 * than unlinked. The real path is checked again here, since the file can
 * become a link to elsewhere after the layout listed it. The temporary file
 * sits at the corpus root, outside every layout directory a measurement
 * walks. The file keeps its mode, which the version digest does not hold.
 */
async function replaceFile(
	corpus: EditedCorpus,
	path: string,
	bytes: Readonly<Uint8Array>,
): Promise<void> {
	const target = await realpath(join(corpus.source.root, path));
	const realRoot = await realpath(corpus.source.root);
	if (!pathIsWithin(target, realRoot)) {
		throw new RefusedPreconditionError(
			`${path} resolves outside the linked corpus directory, so it was not written. Review the edit again.`,
		);
	}

	if (await reachesLiveInstall(corpus.live, [target])) {
		throw new RefusedPreconditionError(LIVE_INSTALL_REFUSAL);
	}

	const { mode } = await stat(target);
	const temporary = join(realRoot, `.rehearse-edit-${randomUUID()}.tmp`);
	try {
		await writeFile(temporary, bytes, { mode });
		await chmod(temporary, mode);
		await rename(temporary, target);
	} finally {
		await rm(temporary, { force: true });
	}
}

async function bytesUnchanged(
	file: string,
	bytes: Readonly<Uint8Array>,
): Promise<boolean> {
	return Buffer.from(await readFile(file)).equals(bytes);
}

/**
 * Refuses, before anything is written or logged, an edit that would write
 * under the live install, that starts from a version the linked directory no
 * longer holds, or that would leave the file as it is and log no new version.
 */
async function refuseUnappliable(
	corpus: EditedCorpus,
	edit: ReviewedCorpusEdit,
	edited: EditedLayout,
): Promise<void> {
	const { source, live } = corpus;
	const refusal = await liveInstallRefusal(source, live, edit.path);
	if (refusal !== null) {
		throw new RefusedPreconditionError(refusal);
	}

	if (edited.startsFrom !== edit.startsFrom) {
		throw new RefusedPreconditionError(
			`The linked directory no longer holds version ${edit.startsFrom}, which the edit was reviewed against; it holds ${edited.startsFrom}. Review the edit again.`,
		);
	}

	if (await bytesUnchanged(join(source.root, edit.path), edited.bytes)) {
		throw new RefusedPreconditionError(
			`The edit leaves ${edit.path} unchanged, so it would make no new version`,
		);
	}
}

/**
 * Logs the starting version before the write, so the last edit reading names
 * it as previous, and refuses the write when the directory changed while the
 * stale count was judged, since that count would describe another tree.
 */
export async function applyCorpusEdit(
	recordsDirectory: string,
	corpus: EditedCorpus,
	edit: ReviewedCorpusEdit,
): Promise<AppliedCorpusEdit> {
	const { source } = corpus;
	const edited = await editedLayout(source, edit);
	await refuseUnappliable(corpus, edit, edited);
	const starting = await measureCorpusVersion(recordsDirectory, source);
	if (starting.kind === "refused") {
		throw new RefusedPreconditionError(
			`The linked corpus does not measure: ${starting.refusal}`,
		);
	}
	const invalidated = await invalidatedBy(
		recordsDirectory,
		source,
		edit,
		edited,
	);
	const beforeWrite = await hashCorpusLayout(source);
	if (corpusVersionDigest(beforeWrite.files) !== edit.startsFrom) {
		throw new RefusedPreconditionError(
			`The linked directory changed while the edit was being applied, so it was not written. Review the edit again.`,
		);
	}

	await replaceFile(corpus, edit.path, edited.bytes);

	const measured = await measureCorpusVersion(recordsDirectory, source);
	if (measured.kind === "refused") {
		throw new Error(
			`The edit was applied, and the corpus no longer measures: ${measured.refusal}`,
		);
	}

	return {
		previous: edit.startsFrom,
		version: measured.digest,
		invalidated,
	};
}
