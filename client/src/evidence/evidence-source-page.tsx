import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import PageContent from "#client/system/components/page-content";
import ScreenHeader from "#client/system/components/screen-header";

import type {
	EvidenceSourceIdentity,
	EvidenceSourceResponse,
} from "./evidence-source-query";
import fetchEvidenceSource from "./evidence-source-query";

const PREFIX_START_INDEX = 0;

type SourceView = EvidenceSourceResponse["view"];

type TextView = Extract<SourceView, { kind: "text" }>;

type HarnessView = Extract<SourceView, { kind: "harness" }>;

interface ExplanationProps {
	readonly children: string;
}

function Explanation({ children }: ExplanationProps): React.JSX.Element {
	return <p className="text-muted-foreground">{children}</p>;
}

/**
 * The recorded text, read-only, with the quoted span marked and scrolled into
 * view once it renders.
 */
interface RecordedTextProps {
	readonly view: TextView;
}

function RecordedText({ view }: RecordedTextProps): React.JSX.Element {
	const mark = useRef<HTMLElement>(null);
	useEffect(() => {
		mark.current?.scrollIntoView({ block: "center" });
	}, [view]);
	const { text, span } = view;

	return (
		<section className="flex min-w-0 flex-col gap-2">
			<h2 className="font-mono text-13 font-medium wrap-anywhere text-secondary-foreground">
				{view.label}
			</h2>
			{span === undefined ? (
				<Explanation>
					The quote is not in the recorded text, so no span is marked.
				</Explanation>
			) : null}
			<pre className="min-w-0 overflow-auto rounded-lg border border-divider bg-raised p-3 font-mono leading-transcript text-13 whitespace-pre-wrap wrap-anywhere">
				{span === undefined ? (
					text
				) : (
					<>
						{text.slice(PREFIX_START_INDEX, span.start)}
						<mark ref={mark} className="bg-accent text-accent-foreground">
							{text.slice(span.start, span.end)}
						</mark>
						{text.slice(span.end)}
					</>
				)}
			</pre>
		</section>
	);
}

interface HarnessResultProps {
	readonly view: HarnessView;
}

function HarnessResult({ view }: HarnessResultProps): React.JSX.Element {
	if (view.value === undefined) {
		return (
			<Explanation>{`Harness result ${view.result}: the judge's input held none.`}</Explanation>
		);
	}
	if (view.result === "harnessFailure") {
		return (
			<section className="flex flex-col gap-2">
				<h2>{`Harness result ${view.result}`}</h2>
				<pre className="min-w-0 rounded-lg border border-divider bg-raised p-3 font-mono leading-transcript text-13 whitespace-pre-wrap wrap-anywhere">
					{view.value}
				</pre>
			</section>
		);
	}

	return (
		<section className="flex flex-col gap-2">
			<h2>{`Harness result ${view.result}: ${view.value.status}`}</h2>
			<ul className="flex list-disc flex-col gap-1 pl-4 text-14">
				{view.value.evidence.map((item) => (
					<li key={`${item.path}:${item.claim}`}>{item.claim}</li>
				))}
			</ul>
		</section>
	);
}

interface SourceBodyProps {
	readonly view: SourceView;
}

function SourceBody({ view }: SourceBodyProps): React.JSX.Element {
	switch (view.kind) {
		case "text": {
			return <RecordedText view={view} />;
		}
		case "harness": {
			return <HarnessResult view={view} />;
		}
		case "absent": {
			return (
				<Explanation>
					The record holds no such source, so there is nothing to open.
				</Explanation>
			);
		}
		case "before-quoted-spans": {
			return (
				<Explanation>
					This evidence was recorded before quoted spans, so it names no span to
					open.
				</Explanation>
			);
		}
		default: {
			const unknown: never = view;

			return unknown;
		}
	}
}

/**
 * The source a judge's evidence item cites, as the run's record holds it.
 * Read-only: nothing here opens a file or launches a program.
 */
interface EvidenceSourcePageProps {
	readonly identity: EvidenceSourceIdentity;
	readonly embedded?: boolean;
}

function EvidenceSourcePage({
	identity,
	embedded = false,
}: EvidenceSourcePageProps): React.JSX.Element {
	const query = useQuery({
		queryFn: async () => await fetchEvidenceSource(identity),
		queryKey: ["evidence-source", identity],
	});

	const reading = (
		<EvidenceSourceReading
			embedded={embedded}
			report={query.data}
			loading={query.isLoading}
			failed={query.isError}
		/>
	);
	if (embedded) {
		return <div className="min-h-0 overflow-y-auto">{reading}</div>;
	}

	return (
		<div>
			<EvidenceSourceHeader identity={identity} record={query.data?.record} />
			{reading}
		</div>
	);
}

interface EvidenceSourceReadingProps {
	readonly embedded: boolean;
	readonly report: EvidenceSourceResponse | undefined;
	readonly loading: boolean;
	readonly failed: boolean;
}

function EvidenceSourceReading({
	embedded,
	report,
	loading,
	failed,
}: EvidenceSourceReadingProps): React.JSX.Element {
	return (
		<PageContent className="max-w-7xl gap-4 wrap-anywhere">
			{embedded && report !== undefined ? (
				<p className="text-14 text-dim">
					From <span className="font-mono">{report.record}</span>
				</p>
			) : null}
			{loading ? <p className="text-muted-foreground">Loading…</p> : null}
			{failed ? (
				<p role="alert" className="text-attention">
					<span aria-hidden="true">⚠ </span>
					Could not open this evidence item.
				</p>
			) : null}
			{report === undefined ? null : (
				<>
					<p>{report.claim}</p>
					<p className="text-14 text-dim">
						{"Cites "}
						<span className="font-mono">
							{report.source} {report.path}
						</span>
					</p>
					<SourceBody view={report.view} />
				</>
			)}
		</PageContent>
	);
}

interface EvidenceSourceHeaderProps {
	readonly identity: EvidenceSourceIdentity;
	readonly record: string | undefined;
}

function EvidenceSourceHeader({
	identity,
	record,
}: EvidenceSourceHeaderProps): React.JSX.Element {
	const returnToRun =
		identity.kind === "stage"
			? `/runs/${encodeURIComponent(identity.run)}?view=results&step=${encodeURIComponent(identity.stage)}`
			: `/runs/${encodeURIComponent(identity.run)}?view=results`;
	return (
		<ScreenHeader
			title="Cited source"
			lead={
				<Link
					to={returnToRun}
					className="text-14 text-link hover:text-link-hover"
				>
					← Back to run Results
				</Link>
			}
			eyebrow={identity.kind === "stage" ? "Step judge" : "Final judge"}
			subline={
				<>
					<span className="block font-mono">
						{identity.kind === "stage" ? `${identity.stage} · ` : ""}
						{identity.item}
					</span>
					{record === undefined ? null : (
						<span className="block">
							{"From "}
							<span className="font-mono">{record}</span>
						</span>
					)}
				</>
			}
		/>
	);
}

export { EvidenceSourcePage as default };
