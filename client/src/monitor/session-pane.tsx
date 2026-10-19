import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import PendingLine from "./pending-line";
import type { MonitoredStage } from "./run-record-query";
import { ClosedSession, sessionMeta } from "./session-closed-reading";
import { TailFooter, useTailKeys } from "./session-tail";
import { TranscriptRows } from "./session-transcript-rows";
import type { StageSessionResponse } from "./stage-session-query";
import { stageSessionQuery } from "./stage-session-query";

/**
 * The session pane (SPEC.md 2d): the stage's transcript as the server reads
 * it, its tail while the session runs and the spans its judge cites once it
 * closes.
 */
interface SessionPaneProps {
	readonly run: string;
	readonly number: number;
	readonly figures: MonitoredStage;
}

function SessionPane({
	run,
	number,
	figures,
}: SessionPaneProps): React.JSX.Element {
	const { stage } = figures;
	const { data, isError } = useQuery(stageSessionQuery(run, stage));
	const meta = data === undefined ? undefined : sessionMeta(data, figures);

	return (
		<section
			aria-label="Live agent session"
			className="flex min-h-0 min-w-0 flex-col border-b border-divider lg:border-r lg:border-b-0"
		>
			<SessionHeading
				run={run}
				number={number}
				stage={stage}
				meta={meta}
				session={data}
			/>
			<SessionActivity run={run} stage={stage} data={data} isError={isError} />
		</section>
	);
}

interface SessionHeadingProps {
	readonly run: string;
	readonly number: number;
	readonly stage: string;
	readonly meta: string | undefined;
	readonly session: StageSessionResponse | undefined;
}

function SessionHeading({
	run,
	number,
	stage,
	meta,
	session,
}: SessionHeadingProps): React.JSX.Element {
	return (
		<div className="flex flex-none flex-wrap items-center gap-3 border-b border-divider px-4.25 py-2.75">
			<h2 className="text-16 font-semibold tracking-caps text-muted-foreground uppercase">
				Step {String(number)} · {stage}
			</h2>
			{meta === undefined ? null : (
				<span className="font-mono text-12 text-dim">{meta}</span>
			)}
			{session?.state === "closed" && session.transcriptPath !== undefined ? (
				<Link
					to="/runs/$run"
					params={{ run }}
					search={{ focus: "events", step: stage, view: "context" }}
					className="ml-auto text-14"
				>
					open transcript
				</Link>
			) : null}
		</div>
	);
}

interface SessionActivityProps {
	readonly run: string;
	readonly stage: string;
	readonly data: StageSessionResponse | undefined;
	readonly isError: boolean;
}

function SessionActivity({
	run,
	stage,
	data,
	isError,
}: SessionActivityProps): React.JSX.Element {
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
		<>
			<div
				ref={body}
				className="relative min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain px-4.25 py-3 font-mono text-13 leading-transcript"
			>
				<SessionReadings
					run={run}
					stage={stage}
					data={data}
					isError={isError}
				/>
			</div>
			{data?.state === "running" ? (
				<TailFooter
					following={following}
					toolCalls={data.lines.filter(({ kind }) => kind === "tool").length}
				/>
			) : null}
		</>
	);
}

function SessionReadings({
	run,
	stage,
	data,
	isError,
}: SessionActivityProps): React.JSX.Element {
	return (
		<>
			{isError ? (
				<p role="alert" className="font-sans text-14 text-attention">
					<span aria-hidden="true">⚠ </span>
					Could not read this step's session.
				</p>
			) : null}
			{data?.state === "running" ? <TranscriptRows lines={data.lines} /> : null}
			{data?.state === "closed" ? (
				<ClosedSession run={run} stage={stage} session={data} />
			) : null}
			{data?.state === "not-started" ? (
				<PendingLine words="This step has not started yet." />
			) : null}
			{data?.state === "untracked" ? (
				<PendingLine words="This step's session id was not recorded, so its transcript cannot be found." />
			) : null}
		</>
	);
}

export { SessionPane as default };
