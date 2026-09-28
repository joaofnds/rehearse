import type { EvidenceLocator, StageExchange } from "./contracts";

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
export interface Span {
	readonly start: number;
	readonly end: number;
}

export interface CitedFile {
	readonly file: string;
	readonly text: string;
}

function collapse(raw: string): CollapsedText {
	let text = "";
	const offsets: number[] = [];
	let pendingSpace = -1;
	for (let index = 0; index < raw.length; index += 1) {
		const character = raw.charAt(index);
		if (/\s/u.test(character)) {
			if (text !== "" && pendingSpace === -1) {
				pendingSpace = index;
			}
			continue;
		}

		if (pendingSpace !== -1) {
			text += " ";
			offsets.push(pendingSpace);
			pendingSpace = -1;
		}
		text += character;
		offsets.push(index);
	}

	return { text, offsets };
}

function collapsedQuote(quote: string): string {
	return collapse(quote).text;
}

function occurrencesOf(haystack: string, needle: string): number {
	let count = 0;
	for (
		let index = haystack.indexOf(needle);
		index !== -1;
		index = haystack.indexOf(needle, index + needle.length)
	) {
		count += 1;
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
	if (index === -1) {
		return undefined;
	}

	const start = haystack.offsets[index] ?? 0;
	const last = haystack.offsets[index + needle.length - 1] ?? start;

	return {
		start,
		end: last + 1,
		occurrences: occurrencesOf(haystack.text, needle),
	};
}

/** The raw character range of the quote's first occurrence in the text. */
export function findSpan(text: string, quote: string): Span | undefined {
	const found = match(text, quote);

	return found === undefined
		? undefined
		: { start: found.start, end: found.end };
}

function lineAt(text: string, offset: number): number {
	return text.slice(0, offset).split("\n").length;
}

/**
 * The line range of the quote's first occurrence across the files in order,
 * and how many times it occurs in all of them.
 */
export function locateInFiles(
	quote: string,
	files: readonly CitedFile[],
): EvidenceLocator | undefined {
	let first: { file: CitedFile; found: Match } | undefined;
	let occurrences = 0;
	for (const file of files) {
		const found = match(file.text, quote);
		if (found === undefined) {
			continue;
		}

		first ??= { file, found };
		occurrences += found.occurrences;
	}
	if (first === undefined) {
		return undefined;
	}

	return {
		kind: "lines",
		file: first.file.file,
		startLine: lineAt(first.file.text, first.found.start),
		endLine: lineAt(first.file.text, first.found.end - 1),
		occurrences,
	};
}

interface DiffLine {
	readonly text: string;
	/** Where the line starts in the whole diff. */
	readonly offset: number;
}

interface DiffHunk {
	readonly file: string;
	readonly header: string;
	readonly headerLine: DiffLine;
	readonly lines: readonly DiffLine[];
}

/**
 * One file's hunks as searched, header lines included, with the raw diff
 * offset of each character and where each hunk starts.
 */
interface FileText {
	readonly text: string;
	readonly offsets: readonly number[];
	readonly hunkStarts: readonly number[];
}

const HUNK_HEADER = /^@@ [^@]* @@/u;

function diffFileName(line: string): string {
	return line.slice(4).replace(/^[ab]\//u, "");
}

/**
 * The hunks of a unified diff, each under the file it changes: the `+++` name,
 * or the `---` name for a deleted file.
 */
function diffHunks(diff: string): DiffHunk[] {
	const hunks: {
		file: string;
		header: string;
		headerLine: DiffLine;
		lines: DiffLine[];
	}[] = [];
	let removed = "";
	let file = "";
	let current: (typeof hunks)[number] | undefined;
	let offset = 0;
	for (const line of diff.split("\n")) {
		const start = offset;
		offset += line.length + 1;
		if (line.startsWith("diff --git ")) {
			current = undefined;
			continue;
		}
		if (current === undefined && line.startsWith("--- ")) {
			removed = diffFileName(line);
			continue;
		}
		if (current === undefined && line.startsWith("+++ ")) {
			file = line === "+++ /dev/null" ? removed : diffFileName(line);
			continue;
		}

		const header = HUNK_HEADER.exec(line)?.[0];
		if (header !== undefined) {
			current = {
				file,
				header,
				headerLine: { text: line, offset: start },
				lines: [],
			};
			hunks.push(current);
			continue;
		}
		current?.lines.push({ text: line, offset: start });
	}

	return hunks;
}

function hunksByFile(
	diff: string,
	cites: (file: string) => boolean,
): DiffHunk[][] {
	const files = new Map<string, DiffHunk[]>();
	for (const hunk of diffHunks(diff)) {
		if (cites(hunk.file)) {
			files.set(hunk.file, [...(files.get(hunk.file) ?? []), hunk]);
		}
	}

	return [...files.values()];
}

/** A file's hunks read in order, each header line whole and each body line past its prefix. */
function fileText(hunks: readonly DiffHunk[], prefixLength: number): FileText {
	let text = "";
	const offsets: number[] = [];
	const hunkStarts: number[] = [];
	for (const hunk of hunks) {
		for (const [index, line] of [hunk.headerLine, ...hunk.lines].entries()) {
			if (hunkStarts.length > 0 || index > 0) {
				text += "\n";
				offsets.push(line.offset - 1);
			}
			if (index === 0) {
				hunkStarts.push(text.length);
			}

			const kept = index === 0 ? line.text : line.text.slice(prefixLength);
			const skipped = line.text.length - kept.length;
			text += kept;
			for (let column = 0; column < kept.length; column += 1) {
				offsets.push(line.offset + skipped + column);
			}
		}
	}

	return { text, offsets, hunkStarts };
}

/**
 * A judge quotes a changed line either with its `+`, `-` or space prefix or
 * without it, so a file's hunks are searched with the prefixes stripped first
 * and as written second.
 */
const PREFIX_LENGTHS = [1, 0];

/**
 * The file and hunk header of the quote's first occurrence. A quote spanning
 * hunks of one file names the hunk it starts in.
 */
export function locateInDiff(
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
				kind: "hunk",
				file: first.hunk.file,
				hunk: first.hunk.header,
				occurrences: found.reduce(
					(total, { located }) => total + located.occurrences,
					0,
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
export function spanInDiff(
	quote: string,
	diff: string,
	locator: { readonly file: string; readonly hunk: string },
): Span | undefined {
	const [hunks = []] = hunksByFile(diff, (file) => file === locator.file);
	const index = hunks.findIndex(({ header }) => header === locator.hunk);
	if (index === -1) {
		return undefined;
	}

	for (const prefixLength of PREFIX_LENGTHS) {
		const { text, offsets, hunkStarts } = fileText(hunks, prefixLength);
		const from = hunkStarts[index] ?? 0;
		const found = match(text.slice(from), quote);
		if (found !== undefined) {
			const start = offsets[from + found.start] ?? 0;

			return { start, end: (offsets[from + found.end - 1] ?? start) + 1 };
		}
	}

	return undefined;
}

export function locateInCommitSubjects(
	quote: string,
	subjects: readonly string[],
): EvidenceLocator | undefined {
	const text = subjects.join("\n");
	const found = match(text, quote);
	if (found === undefined) {
		return undefined;
	}

	return {
		kind: "commit-subject",
		index: lineAt(text, found.start) - 1,
	};
}

/**
 * The raw range in the subjects read one per line of the quote's first
 * occurrence from the subject a locator names, so a view can mark it.
 */
export function spanInCommitSubjects(
	quote: string,
	subjects: readonly string[],
	index: number,
): Span | undefined {
	const offset = subjects
		.slice(0, index)
		.reduce((total, earlier) => total + earlier.length + 1, 0);
	const found = findSpan(subjects.join("\n").slice(offset), quote);

	return found === undefined
		? undefined
		: { start: offset + found.start, end: offset + found.end };
}

/**
 * The exchange and the character range of the quote's first occurrence in the
 * agent's message or the Product Owner's answer, as the record holds them.
 */
export function locateInExchanges(
	quote: string,
	exchanges: readonly StageExchange[],
): EvidenceLocator | undefined {
	for (const [exchange, { agent, productOwnerAnswer }] of exchanges.entries()) {
		const inMessage = match(agent.message, quote);
		if (inMessage !== undefined) {
			return {
				kind: "exchange",
				exchange,
				field: "message",
				start: inMessage.start,
				end: inMessage.end,
			};
		}

		const inAnswer =
			productOwnerAnswer === undefined
				? undefined
				: match(productOwnerAnswer, quote);
		if (inAnswer !== undefined) {
			return {
				kind: "exchange",
				exchange,
				field: "productOwnerAnswer",
				start: inAnswer.start,
				end: inAnswer.end,
			};
		}
	}

	return undefined;
}
