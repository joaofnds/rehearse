import { useState } from "react";
import type { ReactNode } from "react";
import { Switcher } from "./switcher";

function inlineText(text: string): ReactNode {
	return text
		.split(/(?<inline>`[^`\n]+`|\*\*[^*\n]+\*\*)/u)
		.map((part, index) => {
			if (index % 2 === 0) {
				return part;
			}
			if (part.startsWith("`") && part.endsWith("`")) {
				return (
					<code key={index} className="rounded bg-muted px-1 font-mono text-13">
						{part.slice(1, -1)}
					</code>
				);
			}
			if (part.startsWith("**") && part.endsWith("**")) {
				return <strong key={index}>{part.slice(2, -2)}</strong>;
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
		.slice(start + 1)
		.findIndex((line) => /^\s*```/u.test(line));
	const end = close === -1 ? lines.length : start + 1 + close;

	return { text: lines.slice(start + 1, end).join("\n"), next: end + 1 };
}

function formattedBlocks(text: string): readonly ReactNode[] {
	const lines = text.split(/\r?\n/u);
	const blocks: ReactNode[] = [];
	let position = 0;

	while (position < lines.length) {
		const line = lines[position] ?? "";
		const key = position;
		position += 1;
		if (line.trim() === "") {
			continue;
		}
		if (/^\s*```/u.test(line)) {
			const code = fencedCode(lines, key);
			position = Math.max(position, code.next);
			blocks.push(
				<pre
					key={key}
					className="overflow-auto rounded-md bg-muted p-3 font-mono leading-transcript text-13 whitespace-pre-wrap wrap-anywhere"
				>
					<code>{code.text}</code>
				</pre>,
			);
			continue;
		}
		const heading = /^\s*#{1,6}\s+(?<heading>.*)$/su.exec(line);
		if (heading !== null) {
			blocks.push(
				<h3 key={key} className="text-16 font-semibold">
					{inlineText(heading[1] ?? "")}
				</h3>,
			);
			continue;
		}
		if (/^\s*(?:[-*+] |\d+\. )/u.test(line)) {
			const ordered = /^\s*\d+\. /u.test(line);
			const items: ReactNode[] = [];
			const itemPattern = ordered
				? /^\s*\d+\. (?<item>.*)$/su
				: /^\s*[-*+] (?<item>.*)$/su;
			let listPosition = key;
			let match = itemPattern.exec(lines[listPosition] ?? "");
			while (match !== null) {
				items.push(<li key={listPosition}>{inlineText(match[1] ?? "")}</li>);
				listPosition += 1;
				match = itemPattern.exec(lines[listPosition] ?? "");
			}
			position = Math.max(position, listPosition);
			blocks.push(
				ordered ? (
					<ol key={key} className="list-decimal space-y-1 pl-5">
						{items}
					</ol>
				) : (
					<ul key={key} className="list-disc space-y-1 pl-5">
						{items}
					</ul>
				),
			);
			continue;
		}
		const paragraph: string[] = [line];
		while (
			position < lines.length &&
			(lines[position] ?? "").trim() !== "" &&
			!/^\s*(?:```|#{1,6}\s|[-*+] |\d+\. )/u.test(lines[position] ?? "")
		) {
			paragraph.push(lines[position] ?? "");
			position += 1;
		}
		blocks.push(
			<p key={key} className="whitespace-pre-wrap wrap-anywhere">
				{inlineText(paragraph.join("\n"))}
			</p>,
		);
	}

	return blocks;
}

export type RecordedTextMode = "Formatted" | "Raw";

export function RecordedText({
	text,
	initialMode = "Formatted",
}: {
	readonly text: string;
	readonly initialMode?: RecordedTextMode;
}): React.JSX.Element {
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
