import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import type { GradedStageRef } from "#benchmark/operator-grade";
import type { RunListingResponse } from "#client/run-history/run-history-query";
import { runListingQuery } from "#client/run-history/run-history-query";
import ScreenHeader from "#client/system/components/screen-header";
import { Button } from "#client/system/ui/button";
import withinCase from "#client/within-case";

import type { StageReview } from "./stage-review-query";

interface ReviewReturn {
	readonly href: string;
	readonly label: string;
}

function reviewReturn(stage: GradedStageRef): ReviewReturn {
	switch (stage.kind) {
		case "run": {
			return {
				href: `/runs/${encodeURIComponent(stage.run)}?view=results&step=${encodeURIComponent(stage.stage)}`,
				label: "Back to run Results",
			};
		}
		case "rep": {
			return {
				href: `/groups/${encodeURIComponent(stage.groupId)}/reps/${encodeURIComponent(stage.repId)}/attempt?view=results`,
				label: "Back to attempt Results",
			};
		}
		case "replay": {
			return {
				href: `/replays/${encodeURIComponent(stage.lineage)}/${encodeURIComponent(stage.timestamp)}?view=results`,
				label: "Back to replay Results",
			};
		}
		default: {
			return stage satisfies never;
		}
	}
}

function reviewHistoryRow(
	stage: GradedStageRef,
	rows: RunListingResponse["rows"] | undefined,
): RunListingResponse["rows"][number] | undefined {
	return rows?.find((row) => {
		switch (stage.kind) {
			case "run": {
				return row.kind === "run" && row.run === stage.run;
			}
			case "rep": {
				return row.kind === "group" && row.groupId === stage.groupId;
			}
			case "replay": {
				return (
					row.kind === "replay" &&
					row.lineage === stage.lineage &&
					row.timestamp === stage.timestamp
				);
			}
			default: {
				return stage satisfies never;
			}
		}
	});
}

function reviewContext(
	stage: GradedStageRef,
	rows: RunListingResponse["rows"] | undefined,
): string {
	const row = reviewHistoryRow(stage, rows);
	switch (stage.kind) {
		case "run": {
			return row?.kind === "run"
				? `${withinCase(row.shortId ?? "Run", row.caseId)} · ${row.caseId ?? "case unavailable"}`
				: "Run";
		}
		case "rep": {
			return row?.kind === "group"
				? `${withinCase(row.shortId ?? "Group", row.caseId)} · ${row.caseId} · repetition`
				: "Repetition";
		}
		case "replay": {
			return row?.kind === "replay"
				? `${withinCase(row.shortId ?? "Replay", row.caseId)} · ${row.caseId ?? "case unavailable"}${row.shortId === undefined ? "" : " · replay"}`
				: "Replay";
		}
		default: {
			return stage satisfies never;
		}
	}
}

function identityEntries(
	stage: GradedStageRef,
	stageName: string,
): readonly (readonly [string, string])[] {
	switch (stage.kind) {
		case "run": {
			return [
				["Run", stage.run],
				["Step", stage.stage],
			];
		}
		case "rep": {
			return [
				["Group", stage.groupId],
				["Repetition", stage.repId],
				["Step", stage.stage],
			];
		}
		case "replay": {
			return [
				["Lineage", stage.lineage],
				["Timestamp", stage.timestamp],
				["Step", stageName],
			];
		}
		default: {
			return stage satisfies never;
		}
	}
}

interface RecordedStepIdentityProps {
	readonly stage: GradedStageRef;
	readonly stageName: string;
}

function RecordedStepIdentity({
	stage,
	stageName,
}: RecordedStepIdentityProps): React.JSX.Element {
	return (
		<details className="min-w-0 rounded-lg border border-divider bg-card">
			<summary className="min-h-touch-target cursor-pointer px-4 py-3 text-14 text-muted-foreground">
				Recorded step identity
			</summary>
			<dl className="grid gap-3 px-4 pb-4 sm:grid-cols-2">
				{[["Kind", stage.kind], ...identityEntries(stage, stageName)].map(
					([term, value]) => (
						<div key={term} className="min-w-0">
							<dt className="text-12 text-muted-foreground">{term}</dt>
							<dd className="mt-1 font-mono text-12 select-text wrap-anywhere">
								{value}
							</dd>
						</div>
					),
				)}
			</dl>
		</details>
	);
}

interface StageReviewHeaderProps {
	readonly stage: GradedStageRef;
	readonly review: StageReview | undefined;
}

function StageReviewHeader({
	stage,
	review,
}: StageReviewHeaderProps): React.JSX.Element {
	const listing = useQuery(runListingQuery);
	const back = reviewReturn(stage);
	return (
		<ScreenHeader
			title="Review step"
			subline={
				review === undefined
					? undefined
					: `${reviewContext(stage, listing.data?.rows)} · ${review.stageName} · ${review.judgeModel === undefined ? "Judge model not recorded" : `Judge ${review.judgeModel}`}`
			}
			aside={
				<div className="flex flex-wrap items-center gap-2">
					<Button asChild size="compact" variant="ghost">
						<Link to={back.href}>{back.label}</Link>
					</Button>
					<Button asChild size="compact" variant="ghost">
						<Link to="/settings" search={{ view: "judges" }}>
							Judge calibration
						</Link>
					</Button>
				</div>
			}
		/>
	);
}

export { RecordedStepIdentity, reviewContext, reviewReturn, StageReviewHeader };
