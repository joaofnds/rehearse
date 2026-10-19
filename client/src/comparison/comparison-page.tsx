import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import EmptyState from "#client/system/components/empty-state";
import ScreenHeader from "#client/system/components/screen-header";
import Switcher from "#client/system/components/switcher";

import {
	AttemptPairsPresentation,
	WhatMovedPresentation,
} from "./comparison-case-presentations";
import { comparisonSubline, comparisonTitle } from "./comparison-header";
import type { ComparisonResponse } from "./comparison-response";
import {
	ComparisonNotFoundError,
	fetchComparison,
} from "./comparison-response";

const PRESENTATIONS = ["What moved", "Attempt pairs"] as const;

type Presentation = (typeof PRESENTATIONS)[number];

interface ComparisonPageProps {
	readonly digest: string;
}

function ComparisonPage({ digest }: ComparisonPageProps): React.JSX.Element {
	const [presentation, setPresentation] = useState<Presentation>("What moved");
	const query = useQuery({
		queryFn: async () => await fetchComparison(digest),
		queryKey: ["comparison", digest],
	});

	return (
		<div className="flex min-h-full flex-col">
			<ScreenHeader
				title={query.isSuccess ? comparisonTitle(query.data) : "Comparison"}
				subline={query.isSuccess ? comparisonSubline(query.data) : undefined}
				aside={
					query.isSuccess ? (
						<Switcher
							label="Comparison presentation"
							options={PRESENTATIONS}
							selected={presentation}
							onSelect={setPresentation}
						/>
					) : undefined
				}
			/>

			<ComparisonBody
				digest={digest}
				presentation={presentation}
				pending={query.isLoading}
				failure={comparisonFailure(query.error, query.isError)}
				comparison={query.isSuccess ? query.data : undefined}
			/>
		</div>
	);
}

interface ComparisonBodyProps {
	readonly digest: string;
	readonly presentation: Presentation;
	readonly pending: boolean;
	readonly failure: "not-found" | "unreadable" | undefined;
	readonly comparison: ComparisonResponse | undefined;
}

function ComparisonBody({
	digest,
	presentation,
	pending,
	failure,
	comparison,
}: ComparisonBodyProps): React.JSX.Element {
	return (
		<div className="flex flex-1 flex-col gap-8 page-gutter pt-8 pb-12">
			<ComparisonReadStatus pending={pending} failure={failure} />

			{comparison !== undefined && presentation === "Attempt pairs"
				? comparison.report.cases.map(({ caseId }) => (
						<AttemptPairsPresentation
							key={caseId}
							digest={digest}
							caseId={caseId}
							comparison={comparison}
						/>
					))
				: null}

			{comparison !== undefined && presentation === "What moved"
				? comparison.report.cases.map(({ caseId }) => (
						<WhatMovedPresentation
							key={caseId}
							digest={digest}
							caseId={caseId}
							comparison={comparison}
						/>
					))
				: null}
		</div>
	);
}

interface ComparisonReadStatusProps {
	readonly pending: boolean;
	readonly failure: ComparisonBodyProps["failure"];
}

function ComparisonReadStatus({
	pending,
	failure,
}: ComparisonReadStatusProps): React.JSX.Element {
	return (
		<>
			{pending ? <p className="text-muted-foreground">Loading…</p> : null}
			{failure === "not-found" ? (
				<EmptyState heading="No comparison recorded">
					<p>No comparison is recorded for this digest yet.</p>
				</EmptyState>
			) : null}
			{failure === "unreadable" ? (
				<p role="alert" className="text-attention">
					<span aria-hidden="true">⚠ </span>
					Could not load comparison.
				</p>
			) : null}
		</>
	);
}

function comparisonFailure(
	error: Readonly<Error> | null,
	failed: boolean,
): ComparisonBodyProps["failure"] {
	if (!failed) {
		return undefined;
	}
	return error instanceof ComparisonNotFoundError ? "not-found" : "unreadable";
}

export { ComparisonNotFoundError } from "./comparison-response";
export { ComparisonPage };
