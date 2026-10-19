import type { EvidenceLocator, StageExchange } from "./contracts";
import {
	LINE_TERMINATOR_WIDTH,
	PREFIX_START_INDEX,
	SOURCE_CHARACTER_INDEX_STEP,
	findSpan,
	lineAt,
	match,
} from "./evidence-quote";
import type { Match, Span } from "./evidence-quote";

const LINE_NUMBER_BASE = 1;

const EMPTY_CHARACTER_TOTAL = 0;

interface CitedFile {
	readonly file: string;
	readonly text: string;
}

/**
 * The line range of the quote's first occurrence across the files in order,
 * and how many times it occurs in all of them.
 */
function locateInFiles(
	quote: string,
	files: readonly CitedFile[],
): EvidenceLocator | undefined {
	let first: { file: CitedFile; found: Match } | undefined = undefined;
	let occurrences = 0;
	for (const file of files) {
		const found = match(file.text, quote);
		if (found !== undefined) {
			first ??= { file, found };
			occurrences += found.occurrences;
		}
	}
	if (first === undefined) {
		return undefined;
	}

	return {
		endLine: lineAt(
			first.file.text,
			first.found.end - SOURCE_CHARACTER_INDEX_STEP,
		),
		file: first.file.file,
		kind: "lines",
		occurrences,
		startLine: lineAt(first.file.text, first.found.start),
	};
}

function locateInCommitSubjects(
	quote: string,
	subjects: readonly string[],
): EvidenceLocator | undefined {
	const text = subjects.join("\n");
	const found = match(text, quote);
	if (found === undefined) {
		return undefined;
	}

	return {
		index: lineAt(text, found.start) - LINE_NUMBER_BASE,
		kind: "commit-subject",
	};
}

/**
 * The raw range in the subjects read one per line of the quote's first
 * occurrence from the subject a locator names, so a view can mark it.
 */
function spanInCommitSubjects(
	quote: string,
	subjects: readonly string[],
	index: number,
): Span | undefined {
	const offset = subjects
		.slice(PREFIX_START_INDEX, index)
		.reduce(
			(total, earlier) => total + earlier.length + LINE_TERMINATOR_WIDTH,
			EMPTY_CHARACTER_TOTAL,
		);
	const found = findSpan(subjects.join("\n").slice(offset), quote);

	return found === undefined
		? undefined
		: { end: offset + found.end, start: offset + found.start };
}

/**
 * The exchange and the character range of the quote's first occurrence in the
 * agent's message or the Product Owner's answer, as the record holds them.
 */
function locateInExchanges(
	quote: string,
	exchanges: readonly StageExchange[],
): EvidenceLocator | undefined {
	for (const [exchange, { agent, productOwnerAnswer }] of exchanges.entries()) {
		const inMessage = match(agent.message, quote);
		if (inMessage !== undefined) {
			return {
				end: inMessage.end,
				exchange,
				field: "message",
				kind: "exchange",
				start: inMessage.start,
			};
		}

		const inAnswer =
			productOwnerAnswer === undefined
				? undefined
				: match(productOwnerAnswer, quote);
		if (inAnswer !== undefined) {
			return {
				end: inAnswer.end,
				exchange,
				field: "productOwnerAnswer",
				kind: "exchange",
				start: inAnswer.start,
			};
		}
	}

	return undefined;
}

export {
	locateInFiles,
	locateInCommitSubjects,
	spanInCommitSubjects,
	locateInExchanges,
};
export type { CitedFile };
export { findSpan } from "./evidence-quote";
export { locateInDiff, spanInDiff } from "./evidence-diff";
export type { Span } from "./evidence-quote";
