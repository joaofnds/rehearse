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
import { SessionAssessment } from "./session-assessment";
import { SummaryPanel } from "#client/system/components/summary-panel";
import { qualityReadingText } from "./reading-text";
import type { WhatMovedRow } from "#server/comparison-what-moved";

const PRESENTATIONS = ["What moved", "Attempt pairs"] as const;
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

interface AttemptsPerArm {
	readonly control: number;
	readonly baseline: number;
	readonly candidate: number;
}

function attemptsPerArm(
	attempts: ComparisonResponse["attempts"][string],
): AttemptsPerArm {
	return {
		control: attempts.control.length,
		baseline: attempts.baseline.length,
		candidate: attempts.candidate.length,
	};
}

function evaluationScope(mode: ComparisonResponse["report"]["mode"]): string {
	switch (mode) {
		case "session": {
			return "Recorded session check outcomes and saved state checks are shown separately; no independent final workflow outcome is measured.";
		}
		case "pipeline": {
			return "The final workflow outcome is judged independently of intermediate step grades. Read each named measure separately.";
		}
		case "stage": {
			return "Step grades describe the replayed step only; no independent final workflow outcome is measured.";
		}
		default: {
			return mode satisfies never;
		}
	}
}

function CaseLead({
	caseId,
	attribution,
}: {
	readonly caseId: string;
	readonly attribution: ComparisonResponse["attribution"][string][string];
}): React.JSX.Element {
	const change =
		attribution.claim === "identical"
			? "Baseline and candidate used identical corpora"
			: `Changed: ${attribution.differingPaths.join(", ")}`;

	return (
		<header className="flex flex-col gap-1">
			<h2 className="text-17 font-semibold">{caseId}</h2>
			<p className="text-14 text-secondary-foreground">{change}</p>
		</header>
	);
}

function AssessmentOverview({
	mode,
	attempts,
	rows,
	sessionAssessment,
}: {
	readonly mode: ComparisonResponse["report"]["mode"];
	readonly attempts: ComparisonResponse["attempts"][string];
	readonly rows: readonly WhatMovedRow[];
	readonly sessionAssessment:
		| NonNullable<ComparisonResponse["sessionAssessments"]>[string]
		| undefined;
}): React.JSX.Element {
	if (mode === "session") {
		return <SessionAssessment assessment={sessionAssessment} />;
	}

	const primary = rows
		.filter((row) => row.kind === "overall")
		.find((row) => mode !== "pipeline" || row.name === "final");
	const reading = primary?.readings[armPairKey("candidate", "baseline")];
	const title =
		primary === undefined || reading === undefined
			? "Outcome comparison unavailable"
			: `${primary.name === "final" ? "Final workflow outcome" : primary.name} · ${qualityReadingText(reading.verdict).phrase}`;

	return (
		<SummaryPanel title={title} description={evaluationScope(mode)}>
			<p className="text-14 text-muted-foreground">
				Saved attempts · baseline (before) {attempts.baseline.length} ·
				candidate (after) {attempts.candidate.length} · control{" "}
				{attempts.control.length}. Read each measure’s coverage and uncertainty
				before attributing a change.
			</p>
		</SummaryPanel>
	);
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
			<CaseLead caseId={caseId} attribution={attribution} />
			<AssessmentOverview
				mode={comparison.report.mode}
				attempts={attempts}
				rows={comparison.whatMoved[caseId] ?? []}
				sessionAssessment={comparison.sessionAssessments?.[caseId]}
			/>
			<WhatMoved
				caseId={caseId}
				rows={rows}
				attemptsPerArm={attemptsPerArm(attempts)}
			/>
			<AttributionCard
				digest={digest}
				caseId={caseId}
				attribution={attribution}
				baselineArm={comparison.baselineArm}
				moreAttempts={summary.moreAttempts}
			/>
			<ArmCards digest={digest} caseId={caseId} comparison={comparison} />
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
			<CaseLead caseId={caseId} attribution={attribution} />
			<AssessmentOverview
				mode={comparison.report.mode}
				attempts={attempts}
				rows={comparison.whatMoved[caseId] ?? []}
				sessionAssessment={comparison.sessionAssessments?.[caseId]}
			/>
			<AttemptPairs
				digest={digest}
				caseId={caseId}
				mode={comparison.report.mode}
				attempts={attempts}
				histories={comparison.attemptHistories[caseId]}
			/>
			<div className="grid max-w-283 grid-cols-2 gap-3">
				<WhatThePairingSays mode={comparison.report.mode} summary={summary} />
				<ReadWithCare
					digest={digest}
					attemptsPerArm={attemptsPerArm(attempts)}
					corpusVersions={corpusVersions}
					baselineArm={comparison.baselineArm}
					attribution={attribution}
					moreAttempts={summary.moreAttempts}
				/>
			</div>
			<ArmCards digest={digest} caseId={caseId} comparison={comparison} />
		</section>
	);
}

function ArmCards({
	digest,
	caseId,
	comparison,
}: {
	readonly digest: string;
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
			digest={digest}
			histories={comparison.attemptHistories[caseId]}
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
	const [presentation, setPresentation] = useState<Presentation>("What moved");
	const query = useQuery({
		queryKey: ["comparison", digest],
		queryFn: () => fetchComparison(digest),
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

			<div className="flex flex-1 flex-col gap-8 px-6 pt-4 pb-12">
				{query.isLoading ? (
					<p className="text-muted-foreground">Loading…</p>
				) : null}
				{query.isError && query.error instanceof ComparisonNotFoundError ? (
					<EmptyState heading="No comparison recorded">
						<p>No comparison is recorded for this digest yet.</p>
					</EmptyState>
				) : null}
				{query.isError && !(query.error instanceof ComparisonNotFoundError) ? (
					<p role="alert" className="text-attention">
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
