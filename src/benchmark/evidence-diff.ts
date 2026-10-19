import type { EvidenceLocator } from "./contracts";
import type { DiffHunk, DiffLine } from "./evidence-diff-hunks";
import diffHunks from "./evidence-diff-hunks";
import {
	LINE_TERMINATOR_WIDTH,
	MISSING_SEQUENCE_INDEX,
	RAW_TEXT_ORIGIN,
	SOURCE_CHARACTER_INDEX_STEP,
	match,
} from "./evidence-quote";
import type { Span } from "./evidence-quote";

const FIRST_HUNK_LINE_INDEX = 0;

const NO_QUOTE_OCCURRENCES = 0;

const COLUMN_NUMBER_STEP = 1;

const EMPTY_COLLECTION_LENGTH = 0;

/**
 * One file's hunks as searched, header lines included, with the raw diff
 * offset of each character and where each hunk starts.
 */
interface FileText {
	readonly text: string;
	readonly offsets: readonly number[];
	readonly hunkStarts: readonly number[];
}

function hunksByFile(
	diff: string,
	cites: (file: string) => boolean,
): DiffHunk[][] {
	const files = new Map<string, DiffHunk[]>();
	for (const hunk of diffHunks(diff)) {
		if (cites(hunk.file)) {
			const hunks = files.get(hunk.file);
			if (hunks === undefined) {
				files.set(hunk.file, [hunk]);
			} else {
				hunks.push(hunk);
			}
		}
	}

	return [...files.values()];
}

const INITIAL_PROJECTED_CHARACTER = 0;
class DiffFileText {
	private text = "";
	private readonly offsets: number[] = [];
	private readonly hunkStarts: number[] = [];
	public constructor(private readonly prefixLength: number) {}
	public include(hunk: DiffHunk): void {
		const whole = [...hunk.fileHeader, hunk.headerLine];
		for (const [index, line] of [...whole, ...hunk.lines].entries()) {
			this.includeLine(line, index, whole.length);
		}
	}
	private includeLine(
		line: DiffLine,
		index: number,
		wholeLength: number,
	): void {
		if (
			this.hunkStarts.length > EMPTY_COLLECTION_LENGTH ||
			index > FIRST_HUNK_LINE_INDEX
		) {
			this.text += "\n";
			this.offsets.push(line.offset - LINE_TERMINATOR_WIDTH);
		}
		if (index === FIRST_HUNK_LINE_INDEX) {
			this.hunkStarts.push(this.text.length);
		}
		const kept =
			index < wholeLength ? line.text : line.text.slice(this.prefixLength);
		this.includeCharacters(line, kept);
	}
	private includeCharacters(line: DiffLine, kept: string): void {
		const skipped = line.text.length - kept.length;
		this.text += kept;
		for (
			let column = INITIAL_PROJECTED_CHARACTER;
			column < kept.length;
			column += COLUMN_NUMBER_STEP
		) {
			this.offsets.push(line.offset + skipped + column);
		}
	}
	public get value(): FileText {
		return {
			hunkStarts: this.hunkStarts,
			offsets: this.offsets,
			text: this.text,
		};
	}
}
/**
 * A file's diff read in order: its header lines and each hunk header whole,
 * and each hunk body line past its prefix. A hunk starts at its first line,
 * so the first hunk takes in the file's header lines.
 */
function fileText(hunks: readonly DiffHunk[], prefixLength: number): FileText {
	const text = new DiffFileText(prefixLength);
	for (const hunk of hunks) {
		text.include(hunk);
	}

	return text.value;
}

/**
 * A judge quotes a changed line either with its `+`, `-` or space prefix or
 * without it, so a file's hunks are searched with the prefixes stripped first
 * and as written second.
 */
const STRIPPED_DIFF_PREFIX_LENGTH = 1;

const VERBATIM_DIFF_PREFIX_LENGTH = 0;

const PREFIX_LENGTHS = [
	STRIPPED_DIFF_PREFIX_LENGTH,
	VERBATIM_DIFF_PREFIX_LENGTH,
];

/**
 * The file and hunk header of the quote's first occurrence. A quote spanning
 * hunks of one file names the hunk it starts in.
 */
function locateInDiff(
	quote: string,
	diff: string,
	cites: (file: string) => boolean,
): EvidenceLocator | undefined {
	const files = hunksByFile(diff, cites);
	for (const prefixLength of PREFIX_LENGTHS) {
		const found = files.flatMap((hunks) => {
			const { text, hunkStarts } = fileText(hunks, prefixLength);
			const located = match(text, quote);
			if (located === undefined) {
				return [];
			}

			const hunk =
				hunks[hunkStarts.findLastIndex((start) => start <= located.start)];

			return hunk === undefined ? [] : [{ hunk, located }];
		});
		const [first] = found;
		if (first !== undefined) {
			return {
				file: first.hunk.file,
				hunk: first.hunk.header,
				kind: "hunk",
				occurrences: found.reduce(
					(total, { located }) => total + located.occurrences,
					NO_QUOTE_OCCURRENCES,
				),
			};
		}
	}

	return undefined;
}

/**
 * The raw range in the whole diff of the quote's first occurrence from the
 * hunk a locator names, so a view of the recorded diff can mark it.
 */
function spanInDiff(
	quote: string,
	diff: string,
	locator: { readonly file: string; readonly hunk: string },
): Span | undefined {
	const [hunks = []] = hunksByFile(diff, (file) => file === locator.file);
	const index = hunks.findIndex(({ header }) => header === locator.hunk);
	if (index === MISSING_SEQUENCE_INDEX) {
		return undefined;
	}

	for (const prefixLength of PREFIX_LENGTHS) {
		const found = spanInFileText(fileText(hunks, prefixLength), index, quote);
		if (found !== undefined) {
			return found;
		}
	}

	return undefined;
}

function spanInFileText(
	projection: FileText,
	hunkIndex: number,
	quote: string,
): Span | undefined {
	const { text, offsets, hunkStarts } = projection;
	const from = hunkStarts[hunkIndex] ?? RAW_TEXT_ORIGIN;
	const found = match(text.slice(from), quote);
	if (found !== undefined) {
		const start = offsets[from + found.start] ?? RAW_TEXT_ORIGIN;

		return {
			end:
				(offsets[from + found.end - SOURCE_CHARACTER_INDEX_STEP] ?? start) +
				SOURCE_CHARACTER_INDEX_STEP,
			start,
		};
	}

	return undefined;
}

export { locateInDiff, spanInDiff };
