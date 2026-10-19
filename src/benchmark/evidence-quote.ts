const LINE_TERMINATOR_WIDTH = 1;
const PREFIX_START_INDEX = 0;

const NO_PENDING_WHITESPACE_INDEX = -1;

const MISSING_SEQUENCE_INDEX = -1;

const RAW_TEXT_ORIGIN = 0;

const SOURCE_CHARACTER_INDEX_STEP = 1;

const MATCH_OCCURRENCE_COUNT_INCREMENT = 1;

/**
 * Finds a judge's quoted span in the source it cited and says where it sits.
 * A quote matches after whitespace runs collapse to one space on both sides,
 * because the judge read the source as JSON, where line breaks and indentation
 * do not survive as written. Every function answers undefined when the quote
 * occurs nowhere, and the caller decides what that costs.
 */
interface CollapsedText {
	readonly text: string;
	/** The raw offset of each collapsed character. */
	readonly offsets: readonly number[];
}

interface Match {
	readonly start: number;
	readonly end: number;
	readonly occurrences: number;
}

/** A character range in a recorded source's raw text. */
interface Span {
	readonly start: number;
	readonly end: number;
}

const INITIAL_TEXT_INDEX = 0;
class CollapsedQuoteText {
	private text = "";
	private readonly offsets: number[] = [];
	private pendingSpace = NO_PENDING_WHITESPACE_INDEX;
	public include(raw: string): void {
		for (
			let index = INITIAL_TEXT_INDEX;
			index < raw.length;
			index += SOURCE_CHARACTER_INDEX_STEP
		) {
			this.includeCharacter(raw.charAt(index), index);
		}
	}
	private includeCharacter(character: string, index: number): void {
		if (/\s/u.test(character)) {
			if (
				this.text !== "" &&
				this.pendingSpace === NO_PENDING_WHITESPACE_INDEX
			) {
				this.pendingSpace = index;
			}
			return;
		}

		if (this.pendingSpace !== NO_PENDING_WHITESPACE_INDEX) {
			this.appendSpace();
		}
		this.text += character;
		this.offsets.push(index);
	}
	private appendSpace(): void {
		this.text += " ";
		this.offsets.push(this.pendingSpace);
		this.pendingSpace = NO_PENDING_WHITESPACE_INDEX;
	}
	public get value(): CollapsedText {
		return { offsets: this.offsets, text: this.text };
	}
}
function collapse(raw: string): CollapsedText {
	const text = new CollapsedQuoteText();
	text.include(raw);

	return text.value;
}

function collapsedQuote(quote: string): string {
	return collapse(quote).text;
}

function occurrencesOf(haystack: string, needle: string): number {
	let count = 0;
	for (
		let index = haystack.indexOf(needle);
		index !== MISSING_SEQUENCE_INDEX;
		index = haystack.indexOf(needle, index + needle.length)
	) {
		count += MATCH_OCCURRENCE_COUNT_INCREMENT;
	}

	return count;
}

function match(raw: string, quote: string): Match | undefined {
	const needle = collapsedQuote(quote);
	if (needle === "") {
		return undefined;
	}

	const haystack = collapse(raw);
	const index = haystack.text.indexOf(needle);
	if (index === MISSING_SEQUENCE_INDEX) {
		return undefined;
	}

	const start = haystack.offsets[index] ?? RAW_TEXT_ORIGIN;
	const last =
		haystack.offsets[index + needle.length - SOURCE_CHARACTER_INDEX_STEP] ??
		start;

	return {
		end: last + SOURCE_CHARACTER_INDEX_STEP,
		occurrences: occurrencesOf(haystack.text, needle),
		start,
	};
}

/** The raw character range of the quote's first occurrence in the text. */
function findSpan(text: string, quote: string): Span | undefined {
	const found = match(text, quote);

	return found === undefined
		? undefined
		: { end: found.end, start: found.start };
}

function lineAt(text: string, offset: number): number {
	return text.slice(PREFIX_START_INDEX, offset).split("\n").length;
}

export {
	LINE_TERMINATOR_WIDTH,
	PREFIX_START_INDEX,
	MISSING_SEQUENCE_INDEX,
	RAW_TEXT_ORIGIN,
	SOURCE_CHARACTER_INDEX_STEP,
	match,
	findSpan,
	lineAt,
};
export type { Match, Span };
