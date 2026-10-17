import type {
	CheckLayerAssessment,
	CheckLayerArmAssessment,
	SessionComparisonAssessment,
} from "#server/comparison-session-assessment";
import { Metric } from "#client/system/components/metric";
import { RangePlot } from "#client/system/components/range-plot";
import { SummaryPanel } from "#client/system/components/summary-panel";
import { StateBadge } from "#client/system/components/state-badge";
import { DESIGN_ARMS } from "./design-arms";

const ASSESSMENT_BASIS =
	"Recorded session check outcomes and saved state checks are shown separately; no independent final workflow outcome is measured. An attempt passes a check layer when every declared check passes. Recorded outcomes are preserved below.";

function coverage(score: CheckLayerArmAssessment): string {
	let declared = "";
	if (score.declared.length === 1) {
		declared = `${score.declared[0]} checks each`;
	} else if (score.declared.length > 1) {
		declared = `${score.declared.join(" / ")} checks per attempt`;
	}

	return [
		`${score.assessed}/${score.total} attempts assessed`,
		declared,
		score.missing === 0 ? "" : `${score.missing} not recorded`,
		score.undeclared === 0 ? "" : `${score.undeclared} with no checks declared`,
	]
		.filter(Boolean)
		.join(" · ");
}

function AssessmentLayer({
	title,
	assessment,
}: {
	readonly title: string;
	readonly assessment: CheckLayerAssessment;
}): React.JSX.Element {
	const arms = DESIGN_ARMS.map(({ arm, role }) => ({
		arm,
		role,
		score: assessment[arm],
	}));
	const rows = arms.flatMap(({ arm, role, score }) =>
		score.passRate.state === "unavailable"
			? []
			: [
					{
						id: arm,
						label: `${role.replace(" (before)", "").replace(" (after)", "")} · n=${score.assessed}`,
						low: score.passRate.low,
						high: score.passRate.high,
						value: score.passRate.value,
					},
				],
	);

	return (
		<section aria-label={title} className="flex flex-col gap-3">
			<h3 className="text-14 font-medium">{title}</h3>
			<dl className="grid grid-cols-3 gap-4">
				{arms.map(({ arm, role, score }) => (
					<Metric
						key={arm}
						label={role}
						value={
							score.assessed === 0
								? "Not assessed"
								: `${score.passed}/${score.assessed} passed`
						}
						hint={coverage(score)}
					/>
				))}
			</dl>
			<p className="text-12 text-muted-foreground">
				Attempt pass rate · 95% confidence interval
			</p>
			{rows.length === 0 ? (
				<p className="text-14 text-muted-foreground">
					No recorded attempts with declared checks to compare.
				</p>
			) : (
				<RangePlot
					label={`${title} · attempt pass rate · 95% confidence interval`}
					minimum={0}
					maximum={100}
					formatValue={(value) => `${Math.round(value)}%`}
					valueLabel="observed rate"
					rows={rows}
				/>
			)}
		</section>
	);
}

export function SessionAssessment({
	assessment,
}: {
	readonly assessment: SessionComparisonAssessment | undefined;
}): React.JSX.Element {
	if (assessment === undefined) {
		return (
			<SummaryPanel
				title="Recorded session checks"
				description={ASSESSMENT_BASIS}
			>
				<p className="text-14 text-muted-foreground">
					The separate check-layer summary is unavailable in this response. Open
					saved attempts for the recorded assessments.
				</p>
			</SummaryPanel>
		);
	}

	return (
		<SummaryPanel
			title={assessment.title}
			description={ASSESSMENT_BASIS}
			actions={<StateBadge tone="neutral">Observed sample</StateBadge>}
		>
			<div className="grid gap-6 xl:grid-cols-2">
				<AssessmentLayer
					title="Saved state checks"
					assessment={assessment.stateChecks}
				/>
				<AssessmentLayer
					title="Reply / transcript checks"
					assessment={assessment.checks}
				/>
			</div>
			<p className="mt-4 text-14 text-muted-foreground">
				Intervals describe uncertainty in each observed pass rate. These
				observations do not establish equivalent quality or isolate the effect
				of an individual changed file.
			</p>
		</SummaryPanel>
	);
}
