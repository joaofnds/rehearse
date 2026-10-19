import TableShell from "#client/system/components/table-shell";

import type { Criteria } from "./stage-review-draft";
import { criterionValues } from "./stage-review-draft";
import type { GradeRecorded, StageReview } from "./stage-review-query";

const COMPARISON_COLUMNS = ["Criterion", "You", "Judge"] as const;

interface ComparisonProps {
	readonly criteria: Criteria;
	readonly recorded: GradeRecorded;
}

function Comparison({
	criteria,
	recorded,
}: ComparisonProps): React.JSX.Element {
	const { operatorGrade, judgeGrade } = recorded;
	const yours = new Map(criterionValues(operatorGrade));
	const judges = new Map(criterionValues(judgeGrade));
	const ids = [
		...criteria.hardBlockers,
		...criteria.requirements,
		...criteria.dimensions,
	].map(({ id }) => id);

	return (
		<section className="flex flex-col gap-3">
			<TableShell
				columnClasses={["", "w-20 whitespace-nowrap", "w-20 whitespace-nowrap"]}
				caption="Your grade against the judge's"
				columns={[...COMPARISON_COLUMNS]}
				rows={[
					["Step letter", operatorGrade.grade, judgeGrade.grade],
					...ids.map((id) => [id, yours.get(id) ?? "—", judges.get(id) ?? "—"]),
				].map(([criterion, you, judge]) => [
					<span key="criterion" className="font-mono text-12">
						{criterion}
					</span>,
					<span key="you" className="font-mono font-bold">
						{you}
					</span>,
					<span key="judge" className="font-mono font-bold">
						{judge}
					</span>,
				])}
			/>
			{operatorGrade.note === undefined ? null : (
				<p className="text-14 leading-reading text-muted-foreground">
					Your note: {operatorGrade.note}
				</p>
			)}
			<p className="text-14 leading-reading text-pretty">
				{judgeGrade.summary}
			</p>
		</section>
	);
}

function recordedGrade(review: StageReview): GradeRecorded | undefined {
	const { operatorGrade, judgeGrade } = review;
	if (operatorGrade === undefined || judgeGrade === undefined) {
		return undefined;
	}

	return { judgeGrade, operatorGrade };
}

export { Comparison, recordedGrade };
