import { useQuery } from "@tanstack/react-query";

import type { GradedStageRef } from "#benchmark/operator-grade";
import PageContent from "#client/system/components/page-content";

import { StageReviewHeader } from "./stage-review-identity";
import { stageReviewQuery } from "./stage-review-query";
import StageReviewWorkspace from "./stage-review-workspace";

/**
 * A judged step graded blind: the form shows only what the Judge read and the
 * criteria, and the Judge's grade appears once the operator's is recorded.
 */
interface StageReviewPageProps {
	readonly stage: GradedStageRef;
}

function StageReviewPage({ stage }: StageReviewPageProps): React.JSX.Element {
	const query = useQuery(stageReviewQuery(stage));
	const review = query.data;

	return (
		<div>
			<StageReviewHeader stage={stage} review={review} />

			<PageContent>
				{query.isLoading ? (
					<p className="text-muted-foreground">Loading…</p>
				) : null}
				{query.isError ? (
					<p role="alert" className="text-attention">
						<span aria-hidden="true">⚠ </span>
						Could not load this judged step.
					</p>
				) : null}

				{review === undefined ? null : (
					<StageReviewWorkspace stage={stage} review={review} />
				)}
			</PageContent>
		</div>
	);
}

export { StageReviewPage as default };
