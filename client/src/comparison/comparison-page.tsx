import { useQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useState } from "react";
import type { ComparisonArm as ComparisonArmRole } from "#benchmark/comparison-record";
import { apiClient } from "#client/api-client";
import { EmptyState } from "#client/system/components/empty-state";
import { Switcher } from "#client/system/components/switcher";
import { TableShell } from "#client/system/components/table-shell";
import { armPairLabel, armPairNames } from "#server/comparison-arm-pair";
import type { ComparisonAttribution } from "#server/comparison-attribution";
import { plural } from "#client/plural";

const PRESENTATIONS = ["Attempt pairs", "What moved"] as const;
type Presentation = (typeof PRESENTATIONS)[number];

type ComparisonResponse = InferResponseType<
	(typeof apiClient.api.comparisons)[":digest"]["$get"],
	200
>;
type ComparisonReport = ComparisonResponse["report"];
type ComparisonCase = ComparisonReport["cases"][number];
type ComparisonArmReport = ComparisonCase["arms"]["baseline"];
type QualityReadings = ComparisonResponse["qualityReadings"];
type AttemptHistories = ComparisonResponse["attemptHistories"];
type CaseQualityReadings = QualityReadings[string];
type QualityReading = CaseQualityReadings[string][string];

export class ComparisonNotFoundError extends Error {
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

function GradeDistribution({
	arm,
}: {
	readonly arm: ComparisonArmReport;
}): React.JSX.Element {
	return (
		<div className="flex flex-col gap-1">
			{arm.quality.map((measure) => (
				<div key={measure.name} className="flex items-baseline gap-2.5">
					<span className="text-xs text-dim">{measure.name}</span>
					{Object.entries(measure.gradeDistribution).map(([grade, count]) => (
						<span key={grade} className="font-mono font-bold">
							{grade}×{count}
						</span>
					))}
				</div>
			))}
		</div>
	);
}

const COLUMNS = ["Case", "Baseline", "Candidate", "Control"] as const;
const QUALITY_COLUMNS = [
	"Comparison",
	"Measure",
	"Intervals",
	"Reading",
] as const;

function rowFor(benchmarkCase: ComparisonCase): readonly React.ReactNode[] {
	return [
		<span key="case" className="font-mono text-sm">
			{benchmarkCase.caseId}
		</span>,
		<span key="baseline" className="text-muted-foreground">
			<GradeDistribution arm={benchmarkCase.arms.baseline} />
		</span>,
		<GradeDistribution key="candidate" arm={benchmarkCase.arms.candidate} />,
		<GradeDistribution key="control" arm={benchmarkCase.arms.control} />,
	];
}

function intervalLabel(
	armName: ComparisonArmRole,
	interval: QualityReading["interval"]["minuend"],
): string {
	if (interval === undefined) {
		return `${armName} not reached`;
	}

	return `${armName} ${interval.low} to ${interval.high}`;
}

/**
 * A reading's glyph and words. A movement reads in the primary text colour
 * and a reading of no movement sits back, as the handoff's delta cells do;
 * the glyph and the words carry the meaning either way.
 */
function QualityVerdict({
	reading,
}: {
	readonly reading: QualityReading;
}): React.JSX.Element {
	if (reading.verdict.kind === "insideRerunNoise") {
		return (
			<span className="inline-flex items-baseline gap-1.5 text-muted-foreground">
				<span aria-hidden="true">~</span>
				<span>inside rerun noise</span>
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

function AttemptHistoryLinks({
	histories,
}: {
	readonly histories: AttemptHistories;
}): React.JSX.Element | null {
	if (Object.keys(histories).length === 0) {
		return null;
	}

	return (
		<section
			aria-labelledby="attempt-histories-heading"
			className="flex max-w-6xl flex-col gap-2"
		>
			<h2
				id="attempt-histories-heading"
				className="text-xs tracking-widest text-dim uppercase"
			>
				Inspect saved attempt history
			</h2>
			{Object.entries(histories).map(([caseId, arms]) => (
				<div
					key={caseId}
					className="flex flex-col gap-3 rounded-lg border bg-card px-4 py-3"
				>
					<strong className="font-mono text-sm font-normal">{caseId}</strong>
					{Object.entries(arms).map(([arm, links]) => (
						<div
							key={arm}
							className="flex items-baseline gap-4 font-mono text-sm text-dim"
						>
							<span className="w-24 text-xs tracking-widest uppercase">
								{arm}
							</span>
							{links.map((link) =>
								link.status === "available" ? (
									<a
										key={link.repId}
										href={link.href}
										className="-my-5 py-5 text-accent-foreground underline decoration-deeper underline-offset-4 hover:text-pale"
									>
										Rep {link.ordinal}
									</a>
								) : (
									<span
										key={link.repId}
										title="Saved provenance no longer matches"
									>
										Rep {link.ordinal} · stale
									</span>
								),
							)}
						</div>
					))}
				</div>
			))}
		</section>
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
			<h2 id={headingId} className="text-xs tracking-widest text-dim uppercase">
				{"Attribution · "}
				<span className="font-mono tracking-normal normal-case">{caseId}</span>
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
		<div>
			<header className="flex flex-wrap items-center gap-4 border-b border-divider px-6 py-3.5">
				<div>
					<h1 className="text-xl font-medium tracking-tight">Comparison</h1>
					{query.isSuccess ? (
						<p className="mt-1 text-sm text-dim">
							<span className="font-mono">{digest.slice(0, 12)}</span>
							{` · ${plural(query.data.report.cases.length, "case")} · baseline, candidate and control arms`}
						</p>
					) : null}
				</div>
				{query.isSuccess ? (
					<div className="ml-auto">
						<Switcher
							label="Comparison presentation"
							options={PRESENTATIONS}
							selected={presentation}
							onSelect={setPresentation}
						/>
					</div>
				) : null}
			</header>

			<div className="flex flex-col gap-8 px-6 pt-4 pb-12">
				{query.isLoading ? (
					<p className="text-muted-foreground">Loading…</p>
				) : null}
				{query.isError && query.error instanceof ComparisonNotFoundError ? (
					<div className="grid place-items-center py-16">
						<EmptyState heading="No comparison recorded">
							<p>No comparison is recorded for this digest yet.</p>
						</EmptyState>
					</div>
				) : null}
				{query.isError && !(query.error instanceof ComparisonNotFoundError) ? (
					<p role="alert" className="text-muted-foreground">
						<span aria-hidden="true">⚠ </span>
						Could not load comparison.
					</p>
				) : null}

				{query.isSuccess && presentation === "Attempt pairs" ? (
					<>
						<div className="max-w-6xl">
							<TableShell
								caption="ATTEMPT PAIRS"
								columns={[...COLUMNS]}
								rows={query.data.report.cases.map((benchmarkCase) =>
									rowFor(benchmarkCase),
								)}
							/>
						</div>
						<AttemptHistoryLinks
							histories={query.data.attemptHistories ?? {}}
						/>
						{query.data.report.cases.map((benchmarkCase) => (
							<AttributionCards
								key={benchmarkCase.caseId}
								caseId={benchmarkCase.caseId}
								attribution={query.data.attribution[benchmarkCase.caseId] ?? {}}
							/>
						))}
					</>
				) : null}

				{query.isSuccess && presentation === "What moved" ? (
					<QualityReadingTables readings={query.data.qualityReadings} />
				) : null}
			</div>
		</div>
	);
}
