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

interface DiffHunk {
	readonly file: string;
	readonly header: string;
	readonly lines: readonly string[];
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
	const hunks: { file: string; header: string; lines: string[] }[] = [];
	let removed = "";
	let file = "";
	let current: { file: string; header: string; lines: string[] } | undefined;
	for (const line of diff.split("\n")) {
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
			current = { file, header, lines: [] };
			hunks.push(current);
			continue;
		}
		current?.lines.push(line);
	}

	return hunks;
}

/**
 * The file and hunk header of the quote's first occurrence. A judge quotes a
 * changed line either with its `+`, `-` or space prefix or without it, so the
 * hunks are searched with the prefixes stripped first and as written second.
 */
export function locateInDiff(
	quote: string,
	diff: string,
	cites: (file: string) => boolean,
): EvidenceLocator | undefined {
	const hunks = diffHunks(diff).filter(({ file }) => cites(file));
	for (const text of [
		(hunk: DiffHunk) => hunk.lines.map((line) => line.slice(1)).join("\n"),
		(hunk: DiffHunk) => hunk.lines.join("\n"),
	]) {
		const found = hunks.flatMap((hunk) => {
			const located = match(text(hunk), quote);

			return located === undefined ? [] : [{ hunk, located }];
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

export function locateInCommitSubjects(
	quote: string,
	subjects: readonly string[],
): EvidenceLocator | undefined {
	const index = subjects.findIndex(
		(subject) => match(subject, quote) !== undefined,
	);

	return index === -1 ? undefined : { kind: "commit-subject", index };
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
