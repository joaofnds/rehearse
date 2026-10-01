import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { spendReading } from "#client/run-history/run-progress";
import { isTyping } from "#client/shell/use-go-to-shortcut";
import { LiveGlyph, STATUS_VOCABULARY } from "#client/system/components/status";
import type { MonitoredStage } from "./run-record-query";
import type { StageSessionResponse } from "./stage-session-query";
import { stageSessionQuery } from "./stage-session-query";
import { minutesAndSeconds } from "./task-graph";

type SessionLine = Extract<
	StageSessionResponse,
	{ readonly state: "running" }
>["lines"][number];

type CitedSpan = Extract<
	StageSessionResponse,
	{ readonly state: "closed" }
>["spans"][number];

const TEXT_TONE = {
	assistant: "text-foreground",
	user: "text-foreground",
	tool: "text-secondary-foreground",
	result: "text-muted-foreground",
} satisfies Record<SessionLine["kind"], string>;

const lineCountFormat = new Intl.NumberFormat("en-US");

/** How far j and k move the pane: about two rows at its type size. */
const SCROLL_STEP_PX = 40;

/**
 * The design's tail keys (SPEC.md 2d), on the document for the reason the
 * `g` chords are: they have to work when nothing on the page holds focus.
 * Scrolling up reads earlier lines, so k leaves the tail as well.
 */
function useTailKeys(
	scrollBy: (top: number) => void,
	setFollowing: Dispatch<SetStateAction<boolean>>,
): void {
	useEffect(() => {
		const listener: EventListener = (event) => {
			if (
				!(event instanceof KeyboardEvent) ||
				event.metaKey ||
				event.ctrlKey ||
				event.altKey ||
				isTyping(event.target)
			) {
				return;
			}

			switch (event.key) {
				case "f": {
					if (event.repeat) {
						break;
					}
					setFollowing((following) => !following);
					break;
				}
				case "j": {
					scrollBy(SCROLL_STEP_PX);
					break;
				}
				case "k": {
					setFollowing(false);
					scrollBy(-SCROLL_STEP_PX);
					break;
				}
				default: {
					break;
				}
			}
		};

		document.addEventListener("keydown", listener);

		return () => {
			document.removeEventListener("keydown", listener);
		};
	}, [scrollBy, setFollowing]);
}

/** One row of the pane, in the design's three columns. */
function PaneRow({
	first,
	kind,
	text,
	tone,
}: {
	readonly first: string;
	readonly kind: string;
	readonly text: string;
	readonly tone: string;
}): React.JSX.Element {
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

function TranscriptRows({
	lines,
}: {
	readonly lines: readonly SessionLine[];
}): React.JSX.Element {
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

const SPEAKER = {
	message: "assistant",
	productOwnerAnswer: "user",
} satisfies Record<NonNullable<CitedSpan["field"]>, SessionLine["kind"]>;

/**
 * The spans the stage judge cites from the session. The judge cites the
 * session's exchanges, not transcript lines, so a span is numbered by its
 * exchange and named by whose words it quotes, and a span the evidence does
 * not locate reads as cited.
 */
function CitedRows({
	spans,
}: {
	readonly spans: readonly CitedSpan[];
}): React.JSX.Element {
	return (
		<ol aria-label="Transcript">
			{spans.map((span) => {
				const kind = span.field === undefined ? undefined : SPEAKER[span.field];

				return (
					<PaneRow
						key={`${span.section}-${span.item}-${String(span.index)}`}
						first={
							span.exchange === undefined ? "" : `ex ${String(span.exchange)}`
						}
						kind={kind ?? "cited"}
						text={span.quote ?? span.claim}
						tone={TEXT_TONE[kind ?? "assistant"]}
					/>
				);
			})}
		</ol>
	);
}

/** The closed session's note, linking to the stage's page that renders its transcript. */
function ClosedNote({
	run,
	stage,
	transcriptPath,
}: {
	readonly run: string;
	readonly stage: string;
	readonly transcriptPath: string | undefined;
}): React.JSX.Element {
	return (
		<p className="mt-3 rounded-md border border-border bg-raised px-3 py-2.5 font-sans text-11-5 text-muted-foreground">
			{transcriptPath === undefined ? (
				"Session ended. Rehearse kept no copy of its transcript."
			) : (
				<>
					Session ended. The full transcript is on disk; Rehearse keeps only the
					spans the judge cites.{" "}
					<Link to="/runs/$run/stages/$stage" params={{ run, stage }}>
						{transcriptPath}
					</Link>
				</>
			)}
		</p>
	);
}

function sessionMeta(
	session: StageSessionResponse,
	figures: MonitoredStage,
): string | undefined {
	if (session.state === "untracked") {
		return undefined;
	}
	if (session.state === "running") {
		return `session running · ${lineCountFormat.format(session.lineCount)} lines`;
	}

	return [
		"session closed",
		...(session.lineCount === undefined
			? []
			: [`${lineCountFormat.format(session.lineCount)} lines`]),
		...(figures.wallTime.state === "available"
			? [minutesAndSeconds(figures.wallTime.ms)]
			: []),
		...(figures.sessionCost.state === "available"
			? [spendReading(figures.sessionCost.usd)]
			: []),
	].join(" · ");
}

/** The running session's footer: whether the pane follows its tail, and how to change that. */
function TailFooter({
	following,
	toolCalls,
}: {
	readonly following: boolean;
	readonly toolCalls: number;
}): React.JSX.Element {
	return (
		<div className="flex flex-none items-center gap-3 border-t border-divider px-4.25 py-2.25 text-11 text-dim">
			{following ? (
				<LiveGlyph />
			) : (
				<span aria-hidden="true">{STATUS_VOCABULARY.paused.glyph}</span>
			)}
			<span>
				{following ? "Following tail" : "Tail paused"} ·{" "}
				<span className="font-mono">j/k</span> to scroll,{" "}
				<span className="font-mono">f</span> to{" "}
				{following ? "unfollow" : "follow"}
			</span>
			<span className="ml-auto font-mono">
				tool calls collapsed ({String(toolCalls)})
			</span>
		</div>
	);
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
 * it, its tail while the session runs and the spans its judge cites once it
 * closes.
 */
export function SessionPane({
	run,
	number,
	figures,
}: {
	readonly run: string;
	readonly number: number;
	readonly figures: MonitoredStage;
}): React.JSX.Element {
	const { stage } = figures;
	const { data, isError } = useQuery(stageSessionQuery(run, stage));
	const meta = data === undefined ? undefined : sessionMeta(data, figures);
	const body = useRef<HTMLDivElement>(null);
	const [following, setFollowing] = useState(true);
	const scrollBy = useCallback((top: number) => {
		body.current?.scrollBy({ top });
	}, []);
	useTailKeys(scrollBy, setFollowing);

	useEffect(() => {
		if (following && body.current !== null) {
			body.current.scrollTop = body.current.scrollHeight;
		}
	}, [following, data]);

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
				{data?.state === "closed" && data.transcriptPath !== undefined ? (
					<Link
						to="/runs/$run/stages/$stage"
						params={{ run, stage }}
						className="ml-auto text-11-5"
					>
						open session.jsonl
					</Link>
				) : null}
			</div>
			<div
				ref={body}
				className="flex-1 overflow-y-auto px-4.25 py-3 font-mono text-11-5 leading-transcript"
			>
				{isError ? (
					<p role="alert" className="font-sans text-13 text-muted-foreground">
						<span aria-hidden="true">⚠ </span>
						Could not read this step's session.
					</p>
				) : null}
				{data?.state === "running" ? (
					<TranscriptRows lines={data.lines} />
				) : null}
				{data?.state === "closed" ? (
					<>
						{data.spans.length === 0 ? null : <CitedRows spans={data.spans} />}
						<ClosedNote
							run={run}
							stage={stage}
							transcriptPath={data.transcriptPath}
						/>
					</>
				) : null}
				{data?.state === "untracked" ? (
					<PendingLine words="This step's session id was not recorded, so its transcript cannot be found." />
				) : null}
			</div>
			{data?.state === "running" ? (
				<TailFooter
					following={following}
					toolCalls={data.lines.filter(({ kind }) => kind === "tool").length}
				/>
			) : null}
		</section>
	);
}
