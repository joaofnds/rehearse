import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { stageOutputQuery } from "#client/run-detail/investigation-query";
import { spendReading } from "#client/run-history/run-progress";
import {
	SavedOutput,
	savedOutputInitialMode,
} from "#client/session-history/attempt-evidence";

import minutesAndSeconds from "./minutes-and-seconds";
import type { MonitoredStage } from "./run-record-query";
import { EMPTY_COLLECTION_LENGTH } from "./session-tail";
import type { SessionLine } from "./session-transcript-rows";
import { PaneRow, TEXT_TONE } from "./session-transcript-rows";
import type { StageSessionResponse } from "./stage-session-query";

type CitedSpan = Extract<
	StageSessionResponse,
	{ readonly state: "closed" }
>["spans"][number];

const lineCountFormat = new Intl.NumberFormat("en-US");

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
interface CitedRowsProps {
	readonly spans: readonly CitedSpan[];
}

function CitedRows({ spans }: CitedRowsProps): React.JSX.Element {
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

/** The closed session links to saved events for its selected step. */
interface ClosedNoteProps {
	readonly run: string;
	readonly stage: string;
	readonly transcriptPath: string | undefined;
}

function ClosedNote({
	run,
	stage,
	transcriptPath,
}: ClosedNoteProps): React.JSX.Element {
	return (
		<div className="mt-3 rounded-md border border-border bg-raised px-3 py-2.5 font-sans text-14 text-muted-foreground">
			{transcriptPath === undefined ? (
				"Session ended. Rehearse has no copy of its transcript, which it keeps only once the step checkpoints."
			) : (
				<>
					Session ended. Inspect the saved transcript in Context &amp; cost.{" "}
					<Link
						to="/runs/$run"
						params={{ run }}
						search={{ focus: "events", step: stage, view: "context" }}
					>
						Open transcript
					</Link>
					<details className="mt-2">
						<summary className="cursor-pointer">Transcript provenance</summary>
						<Link
							to="/runs/$run"
							params={{ run }}
							search={{ focus: "events", step: stage, view: "context" }}
							className="select-all font-mono wrap-anywhere"
						>
							{transcriptPath}
						</Link>
					</details>
				</>
			)}
		</div>
	);
}

interface ClosedSessionProps {
	readonly run: string;
	readonly stage: string;
	readonly session: Extract<StageSessionResponse, { state: "closed" }>;
}

function ClosedSession({
	run,
	stage,
	session,
}: ClosedSessionProps): React.JSX.Element {
	const output = useQuery(stageOutputQuery(run, stage));

	return (
		<>
			{output.data?.state === "available" ? (
				<SavedOutput
					title="Saved step output"
					initialMode={savedOutputInitialMode(output.data)}
					text={output.data.text}
					note="The session ended. This is its retained output."
				/>
			) : null}
			{session.spans.length === EMPTY_COLLECTION_LENGTH ? null : (
				<details className="mt-3">
					<summary className="cursor-pointer font-sans text-14">
						{session.spans.length} saved Judge citations
					</summary>
					<CitedRows spans={session.spans} />
				</details>
			)}
			<ClosedNote
				run={run}
				stage={stage}
				transcriptPath={session.transcriptPath}
			/>
		</>
	);
}

function sessionMeta(
	session: StageSessionResponse,
	figures: MonitoredStage,
): string | undefined {
	if (session.state === "not-started" || session.state === "untracked") {
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

export { ClosedSession, sessionMeta };
