import { CANDIDATE_AGAINST_BASELINE } from "#server/comparison-arm-pair";

import AttemptPairs from "./attempt-pairs";
import AttributionCard from "./attribution-card";
import type { CasePresentationProps } from "./comparison-case-overview";
import {
	ArmCards,
	CaseOpening,
	attemptsPerArm,
} from "./comparison-case-overview";
import type { ComparisonResponse } from "./comparison-response";
import { ReadWithCare, WhatThePairingSays } from "./pairing-cards";
import WhatMoved from "./what-moved";

function WhatMovedPresentation({
	digest,
	caseId,
	comparison,
}: CasePresentationProps): React.JSX.Element | null {
	const rows = comparison.whatMoved[caseId];
	const attempts = comparison.attempts[caseId];
	const summary = comparison.summary[caseId];
	const attribution =
		comparison.attribution[caseId]?.[CANDIDATE_AGAINST_BASELINE];
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
			<CaseOpening
				caseId={caseId}
				comparison={comparison}
				attribution={attribution}
				attempts={attempts}
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
}: CasePresentationProps): React.JSX.Element | null {
	const attempts = comparison.attempts[caseId];
	const summary = comparison.summary[caseId];
	const corpusVersions = comparison.corpusVersions[caseId];
	const attribution =
		comparison.attribution[caseId]?.[CANDIDATE_AGAINST_BASELINE];
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
			<CaseOpening
				caseId={caseId}
				comparison={comparison}
				attribution={attribution}
				attempts={attempts}
			/>
			<AttemptPairs
				digest={digest}
				caseId={caseId}
				mode={comparison.report.mode}
				attempts={attempts}
				histories={comparison.attemptHistories[caseId]}
			/>
			<PairingReadings
				digest={digest}
				comparison={comparison}
				summary={summary}
				attempts={attempts}
				corpusVersions={corpusVersions}
				attribution={attribution}
			/>
			<ArmCards digest={digest} caseId={caseId} comparison={comparison} />
		</section>
	);
}

interface PairingReadingsProps {
	readonly digest: string;
	readonly comparison: ComparisonResponse;
	readonly summary: ComparisonResponse["summary"][string];
	readonly attempts: ComparisonResponse["attempts"][string];
	readonly corpusVersions: ComparisonResponse["corpusVersions"][string];
	readonly attribution: ComparisonResponse["attribution"][string][string];
}

function PairingReadings({
	digest,
	comparison,
	summary,
	attempts,
	corpusVersions,
	attribution,
}: PairingReadingsProps): React.JSX.Element {
	return (
		<div className="grid max-w-283 grid-cols-1 gap-3 lg:grid-cols-2">
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
	);
}

export { AttemptPairsPresentation, WhatMovedPresentation };
