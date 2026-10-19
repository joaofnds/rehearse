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
import { join } from "node:path";

import UnlistedCorpusFileError from "./corpus-edit-contract";
import type {
	CorpusEdit,
	EditedCorpus,
	EditedLayout,
	OpenedCorpusFile,
} from "./corpus-edit-contract";
import {
	LIVE_INSTALL_REFUSAL,
	reachesLiveInstall,
} from "./corpus-edit-live-guard";
import type { CorpusRoot } from "./corpus-file";
import hashCorpusLayout from "./corpus-layout";
import type { HashedLayout } from "./corpus-layout";
import { corpusVersionDigest } from "./corpus-version";
import { RefusedPreconditionError } from "./exit-codes";
import pathIsWithin from "./path-containment";

const EMPTY_COLLECTION_LENGTH = 0;

/** The layout of a corpus that measures, refusing one that does not. */
async function measuredLayout(source: CorpusRoot): Promise<HashedLayout> {
	const layout = await hashCorpusLayout(source);
	if (layout.refusals.length > EMPTY_COLLECTION_LENGTH) {
		throw new RefusedPreconditionError(
			`The linked corpus does not measure: ${layout.refusals.join("; ")}`,
		);
	}

	return layout;
}

function refuseUnlisted(layout: HashedLayout, path: string): void {
	if (!layout.files.some((file) => file.path === path)) {
		throw new UnlistedCorpusFileError(
			`The corpus report lists no file ${path}`,
		);
	}
}

async function editedLayout(
	source: CorpusRoot,
	edit: CorpusEdit,
): Promise<EditedLayout> {
	const layout = await measuredLayout(source);
	refuseUnlisted(layout, edit.path);

	return {
		bytes: new TextEncoder().encode(edit.text),
		layout,
		startsFrom: corpusVersionDigest(layout.files),
	};
}

async function readListedCorpusFile(
	source: CorpusRoot,
	path: string,
): Promise<OpenedCorpusFile> {
	const layout = await measuredLayout(source);
	refuseUnlisted(layout, path);

	return {
		bytes: await readFile(join(source.root, path)),
		version: corpusVersionDigest(layout.files),
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
	const { target, realRoot } = await editableTarget(corpus, path);

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
async function editableTarget(
	corpus: EditedCorpus,
	path: string,
): Promise<{ readonly target: string; readonly realRoot: string }> {
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

	return { realRoot, target };
}
export { editedLayout, readListedCorpusFile, replaceFile, bytesUnchanged };
