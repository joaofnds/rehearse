import type { SavedStateAssessment } from "#server/saved-state-assessment";
import { StateBadge } from "#client/system/components/state-badge";

export function SavedStateSummary({
	assessment,
	recordedPassed,
}: {
	readonly assessment: SavedStateAssessment | undefined;
	readonly recordedPassed: boolean | undefined;
}): React.JSX.Element {
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
		(assessment.failed === 0) !== recordedPassed;
	return (
		<span className="flex flex-col items-start gap-1">
			<StateBadge tone={assessment.failed > 0 ? "negative" : "positive"}>
				{assessment.failed > 0
					? `Saved state: ${String(assessment.failed)} of ${String(assessment.total)} failed`
					: `Saved state: ${String(assessment.passed)} of ${String(assessment.total)} passed`}
			</StateBadge>
			{disagrees ? (
				<StateBadge tone="attention">Assessment layers disagree</StateBadge>
			) : null}
		</span>
	);
}
