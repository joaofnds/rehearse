import type { GradedStageRef } from "#benchmark/operator-grade";
import StateBadge from "#client/system/components/state-badge";

import GradeForm from "./stage-grade-form";
import { Comparison, recordedGrade } from "./stage-review-comparison";
import InputRead from "./stage-review-evidence";
import { RecordedStepIdentity } from "./stage-review-identity";
import type { StageReview } from "./stage-review-query";

interface StageReviewWorkspaceProps {
	readonly stage: GradedStageRef;
	readonly review: StageReview;
}

function StageReviewWorkspace({
	stage,
	review,
}: StageReviewWorkspaceProps): React.JSX.Element {
	const recorded = recordedGrade(review);
	return (
		<>
			<RecordedStepIdentity stage={stage} stageName={review.stageName} />
			<div className="mb-4 flex flex-wrap items-center gap-3">
				<StateBadge tone={recorded === undefined ? "attention" : "positive"}>
					{recorded === undefined ? "Awaiting your review" : "Review recorded"}
				</StateBadge>
				{recorded === undefined ? (
					<p className="text-14 text-muted-foreground">
						Judge scores remain hidden until you record your grade.
					</p>
				) : null}
			</div>
			<div className="grid max-w-7xl grid-cols-1 items-start gap-6 lg:grid-cols-2">
				<InputRead input={review.input} />
				{recorded === undefined ? (
					<GradeForm stage={stage} criteria={review.criteria} />
				) : (
					<Comparison criteria={review.criteria} recorded={recorded} />
				)}
			</div>
		</>
	);
}

export { StageReviewWorkspace as default };
