import type { CorpusRoot, LiveCorpusRoot } from "./corpus-file";
import type { HashedLayout } from "./corpus-layout";

/** The edited path is not one of the files the corpus report lists. */
class UnlistedCorpusFileError extends Error {
	public override name = "UnlistedCorpusFileError";
}

/** The linked corpus an edit writes to, and the live install it never may. */
interface EditedCorpus {
	readonly source: CorpusRoot;
	readonly live: LiveCorpusRoot;
}

/** New text for one file the corpus report lists. */
interface CorpusEdit {
	readonly path: string;
	readonly text: string;
}

/** An edit, carrying the version its review read. */
interface ReviewedCorpusEdit extends CorpusEdit {
	readonly startsFrom: string;
}

/** What applying an edit would do, read before anything is written. */
interface CorpusEditReview {
	/** The version of the corpus under test the edit starts from. */
	readonly startsFrom: string;
	/** The run-history rows the edit would mark stale. */
	readonly invalidated: readonly string[];
	/** Why an apply of this edit would be refused, read before it is tried. */
	readonly applyRefusal: string | null;
}

interface AppliedCorpusEdit {
	readonly previous: string;
	readonly version: string;
	readonly invalidated: readonly string[];
}

interface EditedLayout {
	readonly layout: HashedLayout;
	readonly startsFrom: string;
	readonly bytes: Readonly<Uint8Array>;
}

interface RecordedCorpusEdit {
	readonly edit: CorpusEdit;
	readonly edited: EditedLayout;
}

/** A listed file as the corpus under test holds it, which an edit starts from. */
interface OpenedCorpusFile {
	readonly bytes: Uint8Array;
	/** The version the corpus held when the file was read. */
	readonly version: string;
}
export { UnlistedCorpusFileError as default };
export type {
	EditedCorpus,
	CorpusEdit,
	ReviewedCorpusEdit,
	CorpusEditReview,
	AppliedCorpusEdit,
	EditedLayout,
	RecordedCorpusEdit,
	OpenedCorpusFile,
};
