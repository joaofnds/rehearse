import type { DiffLine } from "./line-diff";
import { lineDiff } from "./line-diff";

const DIFF_MARK = { same: " ", removed: "−", added: "+" } as const;

const DIFF_BACKGROUND = {
	same: "",
	removed: "bg-diff-removed",
	added: "bg-diff-added",
} as const;

function lineNumber(line: DiffLine): number {
	return line.kind === "removed" ? line.before : line.after;
}

/** Each changed line carries its mark as text, so colour is never the only sign. */
export function DiffPreview({
	path,
	original,
	text,
	unchanged,
}: {
	readonly path: string;
	readonly original: string;
	readonly text: string;
	readonly unchanged: string;
}): React.JSX.Element {
	const lines = lineDiff(original, text);
	if (lines === undefined) {
		return (
			<p className="text-sm text-muted-foreground">
				{`${path} holds too many lines to diff here.`}
			</p>
		);
	}
	if (lines.every(({ kind }) => kind === "same")) {
		return <p className="text-sm text-muted-foreground">{unchanged}</p>;
	}

	return (
		<ol
			aria-label={`Changes to ${path}`}
			className="overflow-x-auto font-mono text-11-5 leading-relaxed"
		>
			{lines.map((line, index) => (
				<li
					key={index}
					className={`flex gap-2.5 whitespace-pre ${DIFF_BACKGROUND[line.kind]}`}
				>
					<span className="w-7 shrink-0 text-right text-faint">
						{lineNumber(line)}
					</span>
					<span
						className={
							line.kind === "same" ? "text-muted-foreground" : "text-pale"
						}
					>
						{`${DIFF_MARK[line.kind]} ${line.text}`}
						{line.noNewline === true ? " (no newline at end)" : null}
					</span>
				</li>
			))}
		</ol>
	);
}
