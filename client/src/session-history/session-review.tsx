import { useQuery } from "@tanstack/react-query";

import SummaryPanel from "#client/system/components/summary-panel";

import ReviewForm from "./session-review-form";
import { sessionReviewQuery } from "./session-review-query";
import type { SessionReviewReading } from "./session-review-query";

interface ReadingProps {
	readonly reading: Readonly<SessionReviewReading>;
}
function Agreement({ reading }: ReadingProps): React.JSX.Element {
	if (reading.stale) {
		return (
			<p className="text-attention">
				Saved attempt changed after review. Agreement is unavailable.
			</p>
		);
	}
	if (reading.agreement === undefined) {
		return <p>No graded Judge result is available for agreement.</p>;
	}

	return (
		<>
			<p>
				{reading.agreement.verdict
					? "Human and Judge verdicts agree."
					: "Human and Judge verdicts disagree."}
			</p>
			{reading.agreement.differences.map((difference) => (
				<p key={difference.id}>
					{difference.id}: human {difference.human}, Judge {difference.judge}
				</p>
			))}
			<p className="text-muted-foreground">
				This single nonblind review does not establish calibrated Judge
				accuracy.
			</p>
		</>
	);
}

function RecordedReview({ reading }: ReadingProps): React.JSX.Element {
	return (
		<div className="flex flex-col gap-3 text-14">
			<p className="font-medium">Human verdict: {reading.review?.verdict}</p>
			<p>{reading.review?.summary}</p>
			<p className="text-12 text-dim">
				{reading.review?.recordedAt} · Nonblind review
			</p>
			{reading.review?.requirements.map(({ id, status }) => (
				<p key={id}>
					{id}: {status}
				</p>
			))}
			<Agreement reading={reading} />
		</div>
	);
}

interface ReviewProps {
	readonly id: string;
	readonly sourceSha256: string | undefined;
}
function ReviewContent({ id, sourceSha256 }: ReviewProps): React.JSX.Element {
	const query = useQuery(sessionReviewQuery(id));
	if (query.isPending) {
		return <p className="text-14">Reading human review…</p>;
	}
	if (query.isError) {
		return (
			<p role="alert" className="text-14 text-attention">
				{query.error.message}
			</p>
		);
	}
	if (sourceSha256 === undefined || sourceSha256 !== query.data.sourceSha256) {
		return (
			<p role="alert" className="text-14 text-attention">
				Saved attempt changed while Results loaded. Reload Results before
				reviewing.
			</p>
		);
	}
	if (query.data.review === undefined) {
		return (
			<ReviewForm
				key={`${id}:${query.data.sourceSha256}`}
				id={id}
				reading={query.data}
			/>
		);
	}

	return <RecordedReview reading={query.data} />;
}

function SessionReviewPanel({
	id,
	sourceSha256,
}: ReviewProps): React.JSX.Element {
	return (
		<SummaryPanel title="Human review">
			<ReviewContent key={id} id={id} sourceSha256={sourceSha256} />
		</SummaryPanel>
	);
}

export { SessionReviewPanel as default };
