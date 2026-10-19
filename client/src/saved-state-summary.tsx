import StateBadge from "#client/system/components/state-badge";
import type { SavedStateAssessment } from "#server/saved-state-assessment";

const NO_FAILED_RESULTS = 0;

interface SavedStateSummaryProps {
	readonly assessment: SavedStateAssessment | undefined;
	readonly recordedPassed: boolean | undefined;
}

function SavedStateSummary({
	assessment,
	recordedPassed,
}: SavedStateSummaryProps): React.JSX.Element {
	if (assessment === undefined || assessment.state === "unavailable") {
		return (
			<span
				className="text-12 text-muted-foreground"
				title={
					assessment?.reason ??
					"No saved state assessment was recorded; declaration is unknown."
				}
			>
				Saved state unavailable
			</span>
		);
	}
	const disagrees =
		recordedPassed !== undefined &&
		(assessment.failed === NO_FAILED_RESULTS) !== recordedPassed;
	return (
		<span className="flex flex-col items-start gap-1">
			<StateBadge
				tone={assessment.failed > NO_FAILED_RESULTS ? "negative" : "positive"}
			>
				{assessment.failed > NO_FAILED_RESULTS
					? `Saved state: ${String(assessment.failed)} of ${String(assessment.total)} failed`
					: `Saved state: ${String(assessment.passed)} of ${String(assessment.total)} passed`}
			</StateBadge>
			{disagrees ? (
				<StateBadge tone="attention">Assessment layers disagree</StateBadge>
			) : null}
		</span>
	);
}

export { SavedStateSummary as default };
