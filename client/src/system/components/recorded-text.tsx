import type { ReactNode } from "react";
import { useState } from "react";

import Switcher from "./switcher";

const INLINE_SEGMENT_PAIR_SIZE = 2;

const PLAIN_SEGMENT_REMAINDER = 0;

const INLINE_MARKER_CODE_UNITS = 1;

const MISSING_INLINE_MARKER_INDEX = -1;

const LINE_NUMBER_BASE = 1;

const TEXT_CURSOR_STEP = 1;

const CODE_DELIMITER_LENGTH = 1;

const STRONG_DELIMITER_LENGTH = 2;

function inlineText(text: string): ReactNode {
	return text
		.split(/(?<inline>`[^`\n]+`|\*\*[^*\n]+\*\*)/u)
		.map((part, index) => {
			if (index % INLINE_SEGMENT_PAIR_SIZE === PLAIN_SEGMENT_REMAINDER) {
				return part;
			}
			if (part.startsWith("`") && part.endsWith("`")) {
				return (
					<code key={index} className="rounded bg-muted px-1 font-mono text-13">
						{part.slice(CODE_DELIMITER_LENGTH, -CODE_DELIMITER_LENGTH)}
					</code>
				);
			}
			if (part.startsWith("**") && part.endsWith("**")) {
				return (
					<strong key={index}>
						{part.slice(STRONG_DELIMITER_LENGTH, -STRONG_DELIMITER_LENGTH)}
					</strong>
				);
			}
			return part;
		});
}

interface FencedCode {
	readonly text: string;
	readonly next: number;
}

function fencedCode(lines: readonly string[], start: number): FencedCode {
	const close = lines
		.slice(start + INLINE_MARKER_CODE_UNITS)
		.findIndex((line) => /^\s*```/u.test(line));
	const end =
		close === MISSING_INLINE_MARKER_INDEX
			? lines.length
			: start + INLINE_MARKER_CODE_UNITS + close;

	return {
		next: end + INLINE_MARKER_CODE_UNITS,
		text: lines.slice(start + INLINE_MARKER_CODE_UNITS, end).join("\n"),
	};
}

interface FormattedBlock {
	readonly node: ReactNode;
	readonly next: number;
}

type BlockStart =
	| { readonly kind: "blank" }
	| { readonly kind: "code" }
	| { readonly kind: "heading"; readonly text: string }
	| { readonly kind: "list" }
	| { readonly kind: "paragraph" };

function blockStart(line: string): BlockStart {
	if (line.trim() === "") {
		return { kind: "blank" };
	}
	if (/^\s*```/u.test(line)) {
		return { kind: "code" };
	}
	const heading = /^\s*#{1,6}\s+(?<heading>.*)$/su.exec(line);
	if (heading !== null) {
		return { kind: "heading", text: heading.groups?.["heading"] ?? "" };
	}
	if (/^\s*(?:[-*+] |\d+\. )/u.test(line)) {
		return { kind: "list" };
	}
	return { kind: "paragraph" };
}

function formattedBlock(lines: readonly string[], key: number): FormattedBlock {
	const start = blockStart(lines[key] ?? "");
	switch (start.kind) {
		case "blank": {
			return { next: key + LINE_NUMBER_BASE, node: null };
		}
		case "code": {
			return formattedCode(lines, key);
		}
		case "heading": {
			return formattedHeading(start.text, key);
		}
		case "list": {
			return formattedList(lines, key);
		}
		case "paragraph": {
			return formattedParagraph(lines, key);
		}
		default: {
			return start satisfies never;
		}
	}
}

function formattedCode(lines: readonly string[], key: number): FormattedBlock {
	const code = fencedCode(lines, key);
	return {
		next: Math.max(key + LINE_NUMBER_BASE, code.next),
		node: (
			<pre
				key={key}
				className="overflow-auto rounded-md bg-muted p-3 font-mono leading-transcript text-13 whitespace-pre-wrap wrap-anywhere"
			>
				<code>{code.text}</code>
			</pre>
		),
	};
}

function formattedHeading(text: string, key: number): FormattedBlock {
	return {
		next: key + LINE_NUMBER_BASE,
		node: (
			<h3 key={key} className="text-16 font-semibold">
				{inlineText(text)}
			</h3>
		),
	};
}

function formattedParagraph(
	lines: readonly string[],
	key: number,
): FormattedBlock {
	const paragraph: string[] = [lines[key] ?? ""];
	let position = key + LINE_NUMBER_BASE;
	while (
		position < lines.length &&
		(lines[position] ?? "").trim() !== "" &&
		!/^\s*(?:```|#{1,6}\s|[-*+] |\d+\. )/u.test(lines[position] ?? "")
	) {
		paragraph.push(lines[position] ?? "");
		position += TEXT_CURSOR_STEP;
	}
	return {
		next: position,
		node: (
			<p key={key} className="whitespace-pre-wrap wrap-anywhere">
				{inlineText(paragraph.join("\n"))}
			</p>
		),
	};
}

function formattedList(lines: readonly string[], key: number): FormattedBlock {
	const ordered = /^\s*\d+\. /u.test(lines[key] ?? "");
	const items: ReactNode[] = [];
	const itemPattern = ordered
		? /^\s*\d+\. (?<item>.*)$/su
		: /^\s*[-*+] (?<item>.*)$/su;
	let position = key;
	let match = itemPattern.exec(lines[position] ?? "");
	while (match !== null) {
		items.push(
			<li key={position}>{inlineText(match.groups?.["item"] ?? "")}</li>,
		);
		position += TEXT_CURSOR_STEP;
		match = itemPattern.exec(lines[position] ?? "");
	}
	return {
		next: Math.max(key + LINE_NUMBER_BASE, position),
		node: ordered ? (
			<ol key={key} className="list-decimal space-y-1 pl-5">
				{items}
			</ol>
		) : (
			<ul key={key} className="list-disc space-y-1 pl-5">
				{items}
			</ul>
		),
	};
}

function formattedBlocks(text: string): readonly ReactNode[] {
	const lines = text.split(/\r?\n/u);
	const blocks: ReactNode[] = [];
	let position = 0;
	while (position < lines.length) {
		const block = formattedBlock(lines, position);
		if (block.node !== null) {
			blocks.push(block.node);
		}
		position = block.next;
	}
	return blocks;
}

type RecordedTextMode = "Formatted" | "Raw";

interface RecordedTextProps {
	readonly text: string;
	readonly initialMode?: RecordedTextMode;
}

function RecordedText({
	text,
	initialMode = "Formatted",
}: RecordedTextProps): React.JSX.Element {
	const [mode, setMode] = useState<RecordedTextMode>(initialMode);

	return (
		<div className="min-w-0 font-sans">
			<Switcher
				label="Output reading mode"
				options={["Formatted", "Raw"]}
				selected={mode}
				onSelect={setMode}
			/>
			{mode === "Raw" ? (
				<pre className="mt-3 overflow-auto font-mono leading-transcript text-13 whitespace-pre-wrap wrap-anywhere">
					{text}
				</pre>
			) : (
				<div className="mt-3 space-y-4 text-14 leading-reading">
					{text === "" ? "(Saved output is empty.)" : formattedBlocks(text)}
				</div>
			)}
		</div>
	);
}

export { RecordedText as default };
export type { RecordedTextMode };
