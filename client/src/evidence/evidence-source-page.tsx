import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { ScreenHeader } from "#client/system/components/screen-header";
import { SectionLabel } from "#client/system/components/section-label";
import type {
	EvidenceSourceIdentity,
	EvidenceSourceResponse,
} from "./evidence-source-query";
import { fetchEvidenceSource } from "./evidence-source-query";

type SourceView = EvidenceSourceResponse["view"];
type TextView = Extract<SourceView, { kind: "text" }>;
type HarnessView = Extract<SourceView, { kind: "harness" }>;

function Explanation({
	children,
}: {
	readonly children: string;
}): React.JSX.Element {
	return <p className="text-muted-foreground">{children}</p>;
}

/**
 * The recorded text, read-only, with the quoted span marked and scrolled into
 * view once it renders.
 */
function RecordedText({
	view,
}: {
	readonly view: TextView;
}): React.JSX.Element {
	const mark = useRef<HTMLElement>(null);
	useEffect(() => {
		mark.current?.scrollIntoView({ block: "center" });
	}, [view]);
	const { text, span } = view;

	return (
		<section className="flex flex-col gap-2">
			<h2>
				<SectionLabel>{view.label}</SectionLabel>
			</h2>
			{span === undefined ? (
				<Explanation>
					The quote is not in the recorded text, so no span is marked.
				</Explanation>
			) : null}
			<pre className="overflow-auto rounded-lg border border-divider bg-raised p-3 font-mono text-sm whitespace-pre-wrap">
				{span === undefined ? (
					text
				) : (
					<>
						{text.slice(0, span.start)}
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

function HarnessResult({
	view,
}: {
	readonly view: HarnessView;
}): React.JSX.Element {
	if (view.value === undefined) {
		return (
			<Explanation>{`Harness result ${view.result}: the judge's input held none.`}</Explanation>
		);
	}
	if (view.result === "harnessFailure") {
		return (
			<section className="flex flex-col gap-2">
				<h2>{`Harness result ${view.result}`}</h2>
				<pre className="rounded-lg border border-divider bg-raised p-3 font-mono text-sm whitespace-pre-wrap">
					{view.value}
				</pre>
			</section>
		);
	}

	return (
		<section className="flex flex-col gap-2">
			<h2>{`Harness result ${view.result}: ${view.value.status}`}</h2>
			<ul className="flex list-disc flex-col gap-1 pl-4 text-sm">
				{view.value.evidence.map((item) => (
					<li key={`${item.path}:${item.claim}`}>{item.claim}</li>
				))}
			</ul>
		</section>
	);
}

function SourceBody({
	view,
}: {
	readonly view: SourceView;
}): React.JSX.Element {
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
export function EvidenceSourcePage({
	identity,
}: {
	readonly identity: EvidenceSourceIdentity;
}): React.JSX.Element {
	const query = useQuery({
		queryKey: ["evidence-source", identity],
		queryFn: () => fetchEvidenceSource(identity),
	});

	return (
		<div>
			<ScreenHeader
				title="Cited source"
				eyebrow={
					identity.kind === "stage"
						? `${identity.stage} judge · ${identity.item}`
						: `final judge · ${identity.item}`
				}
				subline={
					query.isSuccess ? (
						<>
							{"From "}
							<span className="font-mono">{query.data.record}</span>
						</>
					) : undefined
				}
			/>

			<div className="flex max-w-7xl flex-col gap-4 px-6 pt-4 pb-12">
				{query.isLoading ? (
					<p className="text-muted-foreground">Loading…</p>
				) : null}
				{query.isError ? (
					<p role="alert" className="text-muted-foreground">
						<span aria-hidden="true">⚠ </span>
						Could not open this evidence item.
					</p>
				) : null}
				{query.isSuccess ? (
					<>
						<p>{query.data.claim}</p>
						<p className="text-sm text-dim">
							{"Cites "}
							<span className="font-mono">
								{query.data.source} {query.data.path}
							</span>
						</p>
						<SourceBody view={query.data.view} />
					</>
				) : null}
			</div>
		</div>
	);
}
