import { useQuery } from "@tanstack/react-query";
import { STATUS_VOCABULARY } from "#client/system/components/status";
import type { StageSessionResponse } from "./stage-session-query";
import { stageSessionQuery } from "./stage-session-query";

type SessionLine = Extract<
	StageSessionResponse,
	{ readonly state: "running" }
>["lines"][number];

const TEXT_TONE = {
	assistant: "text-foreground",
	user: "text-foreground",
	tool: "text-secondary-foreground",
	result: "text-muted-foreground",
} satisfies Record<SessionLine["kind"], string>;

const lineCountFormat = new Intl.NumberFormat("en-US");

function TranscriptRows({
	lines,
}: {
	readonly lines: readonly SessionLine[];
}): React.JSX.Element {
	return (
		<ol aria-label="Transcript">
			{lines.map((row, index) => (
				<li
					// A tool call and its text can share a transcript line.
					key={`${String(row.line)}-${String(index)}`}
					className="flex gap-3 py-px"
				>
					<span className="w-13.5 flex-none text-right text-faint">
						{String(row.line)}
					</span>
					<span className="w-19.75 flex-none text-dim">{row.kind}</span>
					<span
						className={`flex-1 break-words whitespace-pre-wrap ${TEXT_TONE[row.kind]}`}
					>
						{row.text}
					</span>
				</li>
			))}
		</ol>
	);
}

function sessionMeta(session: StageSessionResponse): string | undefined {
	return session.state === "running"
		? `session running · ${lineCountFormat.format(session.lineCount)} lines`
		: undefined;
}

/** The pane's words for a session it has nothing of, as the pending verdict reads. */
function PendingLine({ words }: { readonly words: string }): React.JSX.Element {
	return (
		<p className="flex items-center gap-2.25 font-sans">
			<span aria-hidden="true" className="text-11 text-dim">
				{STATUS_VOCABULARY.pending.glyph}
			</span>
			<span className="text-13 text-secondary-foreground">{words}</span>
		</p>
	);
}

/**
 * The session pane (SPEC.md 2d): the stage's transcript as the server reads
 * it, its tail while the session runs.
 */
export function SessionPane({
	run,
	number,
	stage,
}: {
	readonly run: string;
	readonly number: number;
	readonly stage: string;
}): React.JSX.Element {
	const { data, isError } = useQuery(stageSessionQuery(run, stage));
	const meta = data === undefined ? undefined : sessionMeta(data);

	return (
		<section
			aria-label="Live agent session"
			className="flex min-h-0 flex-col border-r border-divider"
		>
			<div className="flex flex-none items-center gap-3 border-b border-divider px-4.25 py-2.75">
				<h2 className="text-12 font-medium tracking-caps text-muted-foreground uppercase">
					Step {String(number)} · {stage}
				</h2>
				{meta === undefined ? null : (
					<span className="font-mono text-11 text-dim">{meta}</span>
				)}
			</div>
			<div className="flex-1 overflow-y-auto px-4.25 py-3 font-mono text-11-5 leading-transcript">
				{isError ? (
					<p role="alert" className="font-sans text-13 text-muted-foreground">
						<span aria-hidden="true">⚠ </span>
						Could not read this step's session.
					</p>
				) : null}
				{data?.state === "running" ? (
					<TranscriptRows lines={data.lines} />
				) : null}
				{data?.state === "untracked" ? (
					<PendingLine words="This step's session id was not recorded, so its transcript cannot be found." />
				) : null}
			</div>
		</section>
	);
}
