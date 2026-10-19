import SectionLabel from "#client/system/components/section-label";

import { SessionGroupResults } from "./group-session-results";
import SourceComparison from "./group-source-comparison";
import type { GroupRow } from "./group-workspace-contract";
import { EMPTY_COLLECTION_LENGTH, costLine } from "./group-workspace-contract";
import { clockReading } from "./run-progress";

interface StageResultsProps {
	readonly row: GroupRow;
}

function StageResults({ row }: StageResultsProps): React.JSX.Element {
	return (
		<section className="rounded-lg border border-divider bg-card p-4">
			<h2>
				<SectionLabel>Step results</SectionLabel>
			</h2>
			{row.stageSummaries.length === EMPTY_COLLECTION_LENGTH ? (
				<p className="mt-2 text-12 text-dim">No step summary was recorded.</p>
			) : null}
			<ul className="mt-2 flex flex-col gap-2">
				{row.stageSummaries.map((summary) => (
					<li
						key={summary.stage}
						className="flex flex-wrap items-baseline gap-x-3 border-t border-subtle pt-2 text-12"
					>
						<span className="font-mono font-medium">{summary.stage}</span>
						<span>
							{summary.grades.state === "available"
								? `median ${summary.grades.median} · range ${summary.grades.lowest}–${summary.grades.highest}`
								: `grade unavailable: ${summary.grades.reasons.join("; ")}`}
						</span>
						<span className="text-dim">
							{summary.graded} of {row.reps} graded
						</span>
						{Object.entries(summary.ungraded).map(([status, count]) => (
							<span key={status} className="text-dim">
								{count} {status.toLowerCase().replaceAll("_", " ")}
							</span>
						))}
					</li>
				))}
			</ul>
		</section>
	);
}

function finalExplanation(mode: GroupRow["mode"]): string {
	switch (mode) {
		case "pipeline": {
			return "The final judge grades each whole workflow independently of the step judges.";
		}
		case "stage": {
			return "A stage replay does not reach the final workflow judge.";
		}
		case "session": {
			return "Session reps use deterministic checks, not a final workflow judge.";
		}
		default: {
			return mode satisfies never;
		}
	}
}

interface FinalResultsProps {
	readonly row: GroupRow;
}

function FinalResults({ row }: FinalResultsProps): React.JSX.Element {
	return (
		<section className="rounded-lg border border-divider bg-card p-4">
			<h2>
				<SectionLabel>Final workflow outcomes</SectionLabel>
			</h2>
			<p className="mt-2 text-12 text-muted-foreground">
				{finalExplanation(row.mode)}
			</p>
			<ul className="mt-2 flex flex-wrap gap-3 text-12 font-mono">
				{Object.entries(row.finalOutcomes).map(([outcome, count]) => (
					<li key={outcome}>
						{outcome}: {count}
					</li>
				))}
			</ul>
			<p className="mt-2 text-12 text-dim">
				{row.successful} of {row.reps} reps successful · {row.unreadReps.length}{" "}
				unread
			</p>
		</section>
	);
}

interface ResultsProps {
	readonly row: GroupRow;
}

function Results({ row }: ResultsProps): React.JSX.Element {
	return (
		<div className="flex flex-col gap-4">
			{row.mode === "session" ? (
				<SessionGroupResults row={row} />
			) : (
				<div className="grid gap-4 lg:grid-cols-2">
					<StageResults row={row} />
					{row.mode === "pipeline" ? <FinalResults row={row} /> : null}
				</div>
			)}
			<SourceComparison row={row} />
			<section className="rounded-lg border border-divider bg-card p-4 text-12">
				<h2>
					<SectionLabel>Spend & elapsed</SectionLabel>
				</h2>
				<p className="mt-2">{costLine(row)}</p>
				<p>
					{row.wallTime.state === "available"
						? clockReading(row.wallTime.ms)
						: `Wall time unavailable: ${row.wallTime.reasons.join("; ")}`}
				</p>
				{row.cost.state === "available"
					? row.cost.missing.map((missing) => (
							<p key={`${missing.part}:${missing.reason}`} className="text-dim">
								{missing.part}: {missing.reason}
							</p>
						))
					: null}
			</section>
		</div>
	);
}

export { Results as default };
