import { join } from "node:path";

import type {
	AppliedCorpusEdit,
	CorpusEditReview,
	EditedCorpus,
	EditedLayout,
	RecordedCorpusEdit,
	ReviewedCorpusEdit,
} from "./corpus-edit-contract";
import { bytesUnchanged, editedLayout, replaceFile } from "./corpus-edit-files";
import { liveInstallRefusal } from "./corpus-edit-live-guard";
import type { CorpusRoot } from "./corpus-file";
import { rowsAnEditInvalidates } from "./corpus-invalidation";
import hashCorpusLayout from "./corpus-layout";
import { corpusVersionDigest, measureCorpusVersion } from "./corpus-version";
import { RefusedPreconditionError } from "./exit-codes";

async function invalidatedBy(
	recordsDirectory: string,
	source: CorpusRoot,
	{ edit, edited }: RecordedCorpusEdit,
): Promise<readonly string[]> {
	return await rowsAnEditInvalidates(recordsDirectory, source, {
		edit: { bytes: edited.bytes, path: edit.path },
		layoutPaths: edited.layout.files.map(({ path }) => path),
	});
}

/**
 * Refuses an edit whose file changed after it was opened, since its text
 * would overwrite the change without the editor having seen it.
 */
async function reviewCorpusEdit(
	recordsDirectory: string,
	corpus: EditedCorpus,
	edit: ReviewedCorpusEdit,
): Promise<CorpusEditReview> {
	const { source, live } = corpus;
	const edited = await editedLayout(source, edit);
	if (edited.startsFrom !== edit.startsFrom) {
		throw new RefusedPreconditionError(
			`The linked directory changed after ${edit.path} was opened: it held version ${edit.startsFrom} and now holds ${edited.startsFrom}. Open the file again, since this edit would overwrite the change.`,
		);
	}

	const invalidated = await invalidatedBy(recordsDirectory, source, {
		edit,
		edited,
	});
	const applyRefusal = await liveInstallRefusal(source, live, edit.path);

	return {
		applyRefusal,
		invalidated,
		startsFrom: edited.startsFrom,
	};
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
async function applyCorpusEdit(
	recordsDirectory: string,
	corpus: EditedCorpus,
	edit: ReviewedCorpusEdit,
): Promise<AppliedCorpusEdit> {
	const { source } = corpus;
	const edited = await editedLayout(source, edit);
	await refuseUnappliable(corpus, edit, edited);
	await recordStartingCorpusVersion(recordsDirectory, source);
	const invalidated = await invalidatedBy(recordsDirectory, source, {
		edit,
		edited,
	});
	await assertReviewedCorpusStillCurrent(source, edit.startsFrom);

	await replaceFile(corpus, edit.path, edited.bytes);

	const version = await recordAppliedCorpusVersion(recordsDirectory, source);

	return {
		invalidated,
		previous: edit.startsFrom,
		version,
	};
}
async function recordStartingCorpusVersion(
	recordsDirectory: string,
	source: CorpusRoot,
): Promise<void> {
	const starting = await measureCorpusVersion(recordsDirectory, source);
	if (starting.kind === "refused") {
		throw new RefusedPreconditionError(
			`The linked corpus does not measure: ${starting.refusal}`,
		);
	}
}

async function recordAppliedCorpusVersion(
	recordsDirectory: string,
	source: CorpusRoot,
): Promise<string> {
	const measured = await measureCorpusVersion(recordsDirectory, source);
	if (measured.kind === "refused") {
		throw new Error(
			`The edit was applied, and the corpus no longer measures: ${measured.refusal}`,
		);
	}

	return measured.digest;
}

async function assertReviewedCorpusStillCurrent(
	source: CorpusRoot,
	startsFrom: string,
): Promise<void> {
	const beforeWrite = await hashCorpusLayout(source);
	if (corpusVersionDigest(beforeWrite.files) !== startsFrom) {
		throw new RefusedPreconditionError(
			`The linked directory changed while the edit was being applied, so it was not written. Review the edit again.`,
		);
	}
}
export { default as UnlistedCorpusFileError } from "./corpus-edit-contract";
export type {
	EditedCorpus,
	CorpusEdit,
	ReviewedCorpusEdit,
	CorpusEditReview,
	AppliedCorpusEdit,
	OpenedCorpusFile,
} from "./corpus-edit-contract";
export { readListedCorpusFile } from "./corpus-edit-files";
export { reviewCorpusEdit, applyCorpusEdit };
