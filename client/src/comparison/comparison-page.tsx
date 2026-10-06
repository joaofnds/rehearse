import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiClient } from "#client/api-client";
import { RecordNotFoundError } from "#client/record-not-found";
import { EmptyState } from "#client/system/components/empty-state";
import { Switcher } from "#client/system/components/switcher";
import { pairKey as armPairKey } from "#server/comparison-arm-pair";
import { ScreenHeader } from "#client/system/components/screen-header";
import { ArmCardsBand } from "./arm-cards-band";
import { AttemptPairs } from "./attempt-pairs";
import { AttributionCard } from "./attribution-card";
import { comparisonSubline, comparisonTitle } from "./comparison-header";
import type { ComparisonResponse } from "./comparison-response";
import { ReadWithCare, WhatThePairingSays } from "./pairing-cards";
import { WhatMoved } from "./what-moved";

const PRESENTATIONS = ["Attempt pairs", "What moved"] as const;
type Presentation = (typeof PRESENTATIONS)[number];

export class ComparisonNotFoundError extends RecordNotFoundError {
	public override name = "ComparisonNotFoundError";
}

async function fetchComparison(digest: string): Promise<ComparisonResponse> {
	const response = await apiClient.api.comparisons[":digest"].$get({
		param: { digest },
	});
	if (response.status === 404) {
		throw new ComparisonNotFoundError(`No comparison recorded for ${digest}`);
	}
	if (!response.ok) {
		throw new Error(`Could not load comparison ${digest}`);
	}

	return response.json();
}

function WhatMovedPresentation({
	digest,
	caseId,
	comparison,
}: {
	readonly digest: string;
	readonly caseId: string;
	readonly comparison: ComparisonResponse;
}): React.JSX.Element | null {
	const rows = comparison.whatMoved[caseId];
	const attempts = comparison.attempts[caseId];
	const summary = comparison.summary[caseId];
	const attribution =
		comparison.attribution[caseId]?.[armPairKey("candidate", "baseline")];
	if (
		rows === undefined ||
		attempts === undefined ||
		summary === undefined ||
		attribution === undefined
	) {
		return null;
	}

	return (
		<section
			aria-label={`What moved · ${caseId}`}
			className="flex flex-col gap-4"
		>
			<WhatMoved
				caseId={caseId}
				rows={rows}
				attemptsPerArm={{
					control: attempts.control.length,
					baseline: attempts.baseline.length,
					candidate: attempts.candidate.length,
				}}
			/>
			<AttributionCard
				digest={digest}
				caseId={caseId}
				attribution={attribution}
				baselineArm={comparison.baselineArm}
				moreAttempts={summary.moreAttempts}
			/>
		</section>
	);
}

function AttemptPairsPresentation({
	digest,
	caseId,
	comparison,
}: {
	readonly digest: string;
	readonly caseId: string;
	readonly comparison: ComparisonResponse;
}): React.JSX.Element | null {
	const attempts = comparison.attempts[caseId];
	const summary = comparison.summary[caseId];
	const corpusVersions = comparison.corpusVersions[caseId];
	const attribution =
		comparison.attribution[caseId]?.[armPairKey("candidate", "baseline")];
	if (
		attempts === undefined ||
		summary === undefined ||
		corpusVersions === undefined ||
		attribution === undefined
	) {
		return null;
	}

	return (
		<section
			aria-label={`Attempt pairs · ${caseId}`}
			className="flex flex-col gap-4"
		>
			<AttemptPairs
				caseId={caseId}
				mode={comparison.report.mode}
				attempts={attempts}
				histories={comparison.attemptHistories[caseId]}
			/>
			<div className="grid max-w-283 grid-cols-2 gap-3">
				<WhatThePairingSays mode={comparison.report.mode} summary={summary} />
				<ReadWithCare
					digest={digest}
					attemptsPerArm={{
						control: attempts.control.length,
						baseline: attempts.baseline.length,
						candidate: attempts.candidate.length,
					}}
					corpusVersions={corpusVersions}
					baselineArm={comparison.baselineArm}
					attribution={attribution}
					moreAttempts={summary.moreAttempts}
				/>
			</div>
		</section>
	);
}

function ArmCards({
	caseId,
	comparison,
}: {
	readonly caseId: string;
	readonly comparison: ComparisonResponse;
}): React.JSX.Element | null {
	const figures = comparison.armFigures[caseId];
	const corpusVersions = comparison.corpusVersions[caseId];
	if (figures === undefined || corpusVersions === undefined) {
		return null;
	}

	return (
		<ArmCardsBand
			caseId={caseId}
			showCase={comparison.report.cases.length > 1}
			figures={figures}
			corpusVersions={corpusVersions}
			baselineArm={comparison.baselineArm}
		/>
	);
}

export function ComparisonPage({
	digest,
}: {
	readonly digest: string;
}): React.JSX.Element {
	const [presentation, setPresentation] =
		useState<Presentation>("Attempt pairs");
	const query = useQuery({
		queryKey: ["comparison", digest],
		queryFn: () => fetchComparison(digest),
	});

	return (
		<div className="flex h-full flex-col">
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

			{query.isSuccess
				? query.data.report.cases.map(({ caseId }) => (
						<ArmCards key={caseId} caseId={caseId} comparison={query.data} />
					))
				: null}

			<div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto px-6 pt-4 pb-12">
				{query.isLoading ? (
					<p className="text-muted-foreground">Loading…</p>
				) : null}
				{query.isError && query.error instanceof ComparisonNotFoundError ? (
					<EmptyState heading="No comparison recorded">
						<p>No comparison is recorded for this digest yet.</p>
					</EmptyState>
				) : null}
				{query.isError && !(query.error instanceof ComparisonNotFoundError) ? (
					<p role="alert" className="text-muted-foreground">
						<span aria-hidden="true">⚠ </span>
						Could not load comparison.
					</p>
				) : null}

				{query.isSuccess && presentation === "Attempt pairs"
					? query.data.report.cases.map(({ caseId }) => (
							<AttemptPairsPresentation
								key={caseId}
								digest={digest}
								caseId={caseId}
								comparison={query.data}
							/>
						))
					: null}

				{query.isSuccess && presentation === "What moved"
					? query.data.report.cases.map(({ caseId }) => (
							<WhatMovedPresentation
								key={caseId}
								digest={digest}
								caseId={caseId}
								comparison={query.data}
							/>
						))
					: null}
			</div>
		</div>
	);
}
