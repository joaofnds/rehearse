import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { ComparisonArm as ComparisonArmRole } from "#benchmark/comparison-record";
import { apiClient } from "#client/api-client";
import { RecordNotFoundError } from "#client/record-not-found";
import { EmptyState } from "#client/system/components/empty-state";
import { Switcher } from "#client/system/components/switcher";
import { TableShell } from "#client/system/components/table-shell";
import { armPairLabel, armPairNames } from "#server/comparison-arm-pair";
import type { ComparisonAttribution } from "#server/comparison-attribution";
import { ScreenHeader } from "#client/system/components/screen-header";
import { SectionLabel } from "#client/system/components/section-label";
import { ArmCardsBand } from "./arm-cards-band";
import { AttemptPairs } from "./attempt-pairs";
import { comparisonSubline, comparisonTitle } from "./comparison-header";
import type { ComparisonResponse } from "./comparison-response";
import { ReadWithCare, WhatThePairingSays } from "./pairing-cards";

const PRESENTATIONS = ["Attempt pairs", "What moved"] as const;
type Presentation = (typeof PRESENTATIONS)[number];

type QualityReadings = ComparisonResponse["qualityReadings"];
type CaseQualityReadings = QualityReadings[string];
type QualityReading = CaseQualityReadings[string][string];

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

const QUALITY_COLUMNS = [
	"Comparison",
	"Measure",
	"Intervals",
	"Reading",
] as const;

function intervalLabel(
	armName: ComparisonArmRole,
	interval: QualityReading["interval"]["minuend"],
): string {
	if (interval === undefined) {
		return `${armName} not reached`;
	}

	return `${armName} ${interval.low} to ${interval.high}`;
}

function QualityVerdict({
	reading,
}: {
	readonly reading: QualityReading;
}): React.JSX.Element {
	if (reading.verdict.kind === "insideRerunNoise") {
		return (
			<span className="inline-flex items-baseline gap-1.5 text-dim">
				<span aria-hidden="true">~</span>
				<span>inside rerun noise</span>
			</span>
		);
	}

	if (reading.verdict.kind === "unavailable") {
		return (
			<span className="inline-flex items-baseline gap-1.5 text-dim">
				<span aria-hidden="true">?</span>
				<span>unavailable</span>
			</span>
		);
	}

	if (reading.verdict.kind === "unchangedAlreadyClear") {
		return (
			<span className="inline-flex items-baseline gap-1.5 text-dim">
				<span aria-hidden="true">=</span>
				<span>unchanged, already clear</span>
			</span>
		);
	}

	return (
		<span className="inline-flex items-baseline gap-1.5 text-foreground">
			<span aria-hidden="true">↑</span>
			<span>{`${reading.verdict.arm} separates`}</span>
		</span>
	);
}

function QualityIntervals({
	pairKey,
	reading,
}: {
	readonly pairKey: string;
	readonly reading: QualityReading;
}): React.JSX.Element {
	const names = armPairNames(pairKey);

	return (
		<div className="flex flex-col gap-1 font-mono text-sm">
			<span>{intervalLabel(names.minuend, reading.interval.minuend)}</span>
			<span>
				{intervalLabel(names.subtrahend, reading.interval.subtrahend)}
			</span>
		</div>
	);
}

function qualityRowsFor(
	readings: CaseQualityReadings,
): readonly (readonly React.ReactNode[])[] {
	return Object.entries(readings).flatMap(([pairKey, measures]) =>
		Object.entries(measures).map(([measureName, reading]) => [
			armPairLabel(pairKey),
			<span
				key={`${pairKey}-${measureName}-name`}
				className="font-mono text-sm"
			>
				{measureName}
			</span>,
			<QualityIntervals
				key={`${pairKey}-${measureName}`}
				pairKey={pairKey}
				reading={reading}
			/>,
			<QualityVerdict
				key={`${pairKey}-${measureName}-verdict`}
				reading={reading}
			/>,
		]),
	);
}

function QualityReadingTables({
	readings,
}: {
	readonly readings: QualityReadings;
}): React.JSX.Element {
	return (
		<div className="flex max-w-6xl flex-col gap-8">
			{Object.entries(readings).map(([caseId, caseReadings]) => (
				<TableShell
					key={caseId}
					caption={
						<>
							{"WHAT MOVED · "}
							<span className="font-mono tracking-normal normal-case">
								{caseId}
							</span>
						</>
					}
					columns={QUALITY_COLUMNS}
					rows={qualityRowsFor(caseReadings)}
				/>
			))}
		</div>
	);
}

function AttributionCard({
	pairKey,
	attribution,
}: {
	readonly pairKey: string;
	readonly attribution: ComparisonAttribution;
}): React.JSX.Element {
	return (
		<div className="flex flex-col gap-1.5 rounded-lg border bg-card px-4 py-3">
			<span className="font-mono text-xs text-dim">
				{armPairLabel(pairKey)}
			</span>
			<AttributionReading attribution={attribution} />
		</div>
	);
}

function AttributionReading({
	attribution,
}: {
	readonly attribution: ComparisonAttribution;
}): React.JSX.Element {
	if (attribution.claim === "identical") {
		return <p>No corpus difference between these arms.</p>;
	}

	if (attribution.claim === "attributable") {
		return (
			<p>
				The only corpus difference between these arms is{" "}
				<code className="font-mono text-sm text-pale">
					{attribution.differingPath}
				</code>
				. A movement between them is attributable to that file.
			</p>
		);
	}

	return (
		<div>
			<p>
				<span aria-hidden="true">⚠ </span>
				Refuses the attribution claim: more than one file could explain a
				movement between these arms.
			</p>
			<ul className="mt-1.5 flex flex-col gap-1 font-mono text-sm text-pale">
				{attribution.differingPaths.map((path) => (
					<li key={path}>{path}</li>
				))}
			</ul>
		</div>
	);
}

function AttributionCards({
	caseId,
	attribution,
}: {
	readonly caseId: string;
	readonly attribution: Readonly<Record<string, ComparisonAttribution>>;
}): React.JSX.Element {
	const headingId = `comparison-attribution-${caseId}`;

	return (
		<section
			aria-labelledby={headingId}
			className="flex max-w-6xl flex-col gap-2"
		>
			<h2 id={headingId}>
				<SectionLabel>
					{"Attribution · "}
					<span className="font-mono tracking-normal normal-case">
						{caseId}
					</span>
				</SectionLabel>
			</h2>
			<div className="flex flex-col gap-2">
				{Object.entries(attribution).map(([pairKey, claim]) => (
					<AttributionCard
						key={pairKey}
						pairKey={pairKey}
						attribution={claim}
					/>
				))}
			</div>
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
		comparison.attribution[caseId]?.["candidateMinusBaseline"];
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

				{query.isSuccess && presentation === "What moved" ? (
					<>
						<QualityReadingTables readings={query.data.qualityReadings} />
						{query.data.report.cases.map((benchmarkCase) => (
							<AttributionCards
								key={benchmarkCase.caseId}
								caseId={benchmarkCase.caseId}
								attribution={query.data.attribution[benchmarkCase.caseId] ?? {}}
							/>
						))}
					</>
				) : null}
			</div>
		</div>
	);
}
