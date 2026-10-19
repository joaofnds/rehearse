import SummaryPanel from "#client/system/components/summary-panel";
import { CANDIDATE_AGAINST_BASELINE } from "#server/comparison-arm-pair";
import type { WhatMovedRow } from "#server/comparison-what-moved";

import ArmCardsBand from "./arm-cards-band";
import type { ComparisonResponse } from "./comparison-response";
import { qualityReadingText } from "./reading-text";
import SessionAssessment from "./session-assessment";

const SINGLE_ITEM_COUNT = 1;

interface AttemptsPerArm {
	readonly control: number;
	readonly baseline: number;
	readonly candidate: number;
}

function attemptsPerArm(
	attempts: ComparisonResponse["attempts"][string],
): AttemptsPerArm {
	return {
		baseline: attempts.baseline.length,
		candidate: attempts.candidate.length,
		control: attempts.control.length,
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

interface CaseLeadProps {
	readonly caseId: string;
	readonly attribution: ComparisonResponse["attribution"][string][string];
}

function CaseLead({ caseId, attribution }: CaseLeadProps): React.JSX.Element {
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

interface AssessmentOverviewProps {
	readonly mode: ComparisonResponse["report"]["mode"];
	readonly attempts: ComparisonResponse["attempts"][string];
	readonly rows: readonly WhatMovedRow[];
	readonly sessionAssessment:
		| NonNullable<ComparisonResponse["sessionAssessments"]>[string]
		| undefined;
}

function AssessmentOverview({
	mode,
	attempts,
	rows,
	sessionAssessment,
}: AssessmentOverviewProps): React.JSX.Element {
	if (mode === "session") {
		return <SessionAssessment assessment={sessionAssessment} />;
	}

	const primary = rows
		.filter((row) => row.kind === "overall")
		.find((row) => mode !== "pipeline" || row.name === "final");
	const reading = primary?.readings[CANDIDATE_AGAINST_BASELINE];
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

interface CasePresentationProps {
	readonly digest: string;
	readonly caseId: string;
	readonly comparison: ComparisonResponse;
}

function ArmCards({
	digest,
	caseId,
	comparison,
}: CasePresentationProps): React.JSX.Element | null {
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
			showCase={comparison.report.cases.length > SINGLE_ITEM_COUNT}
			figures={figures}
			corpusVersions={corpusVersions}
			baselineArm={comparison.baselineArm}
		/>
	);
}

export { ArmCards, AssessmentOverview, attemptsPerArm, CaseLead };
export type { CasePresentationProps };
