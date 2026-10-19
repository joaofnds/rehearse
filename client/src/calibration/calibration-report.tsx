import { Link } from "@tanstack/react-router";

import plural from "#client/plural";
import StateBadge from "#client/system/components/state-badge";
import SummaryPanel from "#client/system/components/summary-panel";
import TableShell from "#client/system/components/table-shell";
import { Button } from "#client/system/ui/button";

import { COLUMNS, NO_RECORDED_REVIEWS, rowFor } from "./calibration-agreement";
import DriftAside from "./calibration-drift";
import { reviewPath } from "./calibration-figures";
import type { CalibrationResponse } from "./calibration-query";

const NO_UNGRADED_RESULTS = 0;

interface ReviewNextProps {
	readonly next: CalibrationResponse["next"];
	readonly reviews: number;
}

function ReviewNext({ next, reviews }: ReviewNextProps): React.JSX.Element {
	if (next === null) {
		return (
			<div className="flex items-center gap-3">
				<span className="text-12 text-dim">
					{reviews === NO_RECORDED_REVIEWS
						? "No step the judge graded is recorded yet."
						: "Every judged step has your review."}
				</span>
				<Button size="compact" disabled>
					Review next step
				</Button>
			</div>
		);
	}

	return (
		<Button asChild size="compact">
			<Link to={reviewPath(next)}>Review next step</Link>
		</Button>
	);
}

interface FirstReviewProps {
	readonly report: CalibrationResponse;
}

function FirstReview({ report }: FirstReviewProps): React.JSX.Element {
	return (
		<SummaryPanel
			title="Your first calibration review"
			description="Compare your judgment with the Judge's using the same saved evidence."
		>
			<div className="flex flex-col gap-4 text-14">
				{report.ungraded > NO_UNGRADED_RESULTS ? (
					<div>
						<StateBadge tone="attention">
							{plural(report.ungraded, "step")} awaiting your review
						</StateBadge>
					</div>
				) : null}
				<p>
					Open a judged step, read its task and output, and grade each rubric
					criterion. Judge's scores stay hidden until you record your grade.
				</p>
				<p className="text-muted-foreground">
					Agreement and drift will appear after your first saved review.
					Calibration records your assessment; it does not change the original
					grade.
				</p>
				{report.next === null ? (
					<div>
						<Button asChild variant="outline">
							<Link to="/cases" search={{}}>
								Browse cases
							</Link>
						</Button>
					</div>
				) : null}
			</div>
		</SummaryPanel>
	);
}

interface CalibrationReportProps {
	readonly report: CalibrationResponse;
}

function CalibrationReport({
	report,
}: CalibrationReportProps): React.JSX.Element {
	if (report.reviews === NO_RECORDED_REVIEWS) {
		return (
			<div className="max-w-250">
				<FirstReview report={report} />
			</div>
		);
	}
	return (
		<div className="grid min-w-0 grid-cols-1 gap-4.5 lg:grid-cols-main-aside">
			<div className="min-w-0 self-start">
				<TableShell
					className="min-w-200 table-fixed"
					columnClasses={["w-56", "w-16", "w-16", "w-32", ""]}
					caption="Your grade against the judge's, same evidence"
					columns={[...COLUMNS]}
					rows={report.rows.map((row) => rowFor(row))}
				/>
			</div>
			<DriftAside groups={report.groups} />
		</div>
	);
}

export { CalibrationReport, ReviewNext };
