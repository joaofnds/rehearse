import type { StageSessionResponse } from "./stage-session-query";

type SessionLine = Extract<
	StageSessionResponse,
	{ readonly state: "running" }
>["lines"][number];

const TEXT_TONE = {
	assistant: "text-foreground",
	result: "text-muted-foreground",
	tool: "text-secondary-foreground",
	user: "text-foreground",
} satisfies Record<SessionLine["kind"], string>;

/** One row of the pane, in the design's three columns. */
interface PaneRowProps {
	readonly first: string;
	readonly kind: string;
	readonly text: string;
	readonly tone: string;
}

function PaneRow({ first, kind, text, tone }: PaneRowProps): React.JSX.Element {
	return (
		<li className="flex gap-3 py-px">
			<span className="w-13.5 flex-none text-right text-faint">{first}</span>
			<span className="w-19.75 flex-none text-dim">{kind}</span>
			<span className={`flex-1 break-words whitespace-pre-wrap ${tone}`}>
				{text}
			</span>
		</li>
	);
}

interface TranscriptRowsProps {
	readonly lines: readonly SessionLine[];
}

function TranscriptRows({ lines }: TranscriptRowsProps): React.JSX.Element {
	return (
		<ol aria-label="Transcript">
			{lines.map((row, index) => (
				<PaneRow
					// A tool call and its text can share a transcript line.
					key={`${String(row.line)}-${String(index)}`}
					first={String(row.line)}
					kind={row.kind}
					text={row.text}
					tone={TEXT_TONE[row.kind]}
				/>
			))}
		</ol>
	);
}

export { PaneRow, TEXT_TONE, TranscriptRows };
export type { SessionLine };
