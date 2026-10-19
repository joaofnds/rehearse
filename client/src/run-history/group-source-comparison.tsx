import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { corpusMeasurementReading } from "#benchmark/corpus-version-label";
import type { RunRecordResponse } from "#client/monitor/run-record-query";
import { runRecordQuery } from "#client/monitor/run-record-query";
import stageCostReading from "#client/run-detail/step-readings";
import { outcomeReading } from "#client/run-detail/task-grade-card";
import SectionLabel from "#client/system/components/section-label";

import type { GroupRow } from "./group-workspace-contract";
import { NO_GRADED_REPS, costLine } from "./group-workspace-contract";
import { clockReading } from "./run-progress";

interface SourceStepReadingProps {
	readonly record: RunRecordResponse | undefined;
	readonly stageName: string;
	readonly loading: boolean;
	readonly error: string | undefined;
}

function SourceStepReading({
	record,
	stageName,
	loading,
	error,
}: SourceStepReadingProps): React.JSX.Element {
	const stage = record?.stages.find(
		(candidate) => candidate.stage === stageName,
	);
	const outcome =
		record === undefined ? undefined : outcomeReading(record.finalOutcome);
	return (
		<>
			{loading ? (
				<p className="mt-2 text-12 text-dim">Loading source step…</p>
			) : null}
			{error === undefined ? null : (
				<p role="alert" className="mt-2 text-12 text-dim">
					Source step unavailable: {error}
				</p>
			)}
			{record !== undefined && stage === undefined ? (
				<p className="mt-2 text-12 text-dim">
					The source run records no {stageName} step.
				</p>
			) : null}
			{stage === undefined ? null : (
				<p className="mt-2 text-12">
					Source step {stageName}:{" "}
					{stage.grade.state === "available"
						? stage.grade.letter
						: `grade unavailable (${stage.grade.reasons.join("; ")})`}{" "}
					· Worker + Judge {stageCostReading(stage)} ·{" "}
					{stage.wallTime.state === "available"
						? clockReading(stage.wallTime.ms)
						: `wall time unavailable (${stage.wallTime.reasons.join("; ")})`}{" "}
					· {corpusMeasurementReading(stage.corpusVersion)}
				</p>
			)}
			{outcome === undefined ? null : (
				<p className="mt-1 text-12 text-dim">
					Source workflow outcome: {outcome.value} · {outcome.note}
				</p>
			)}
		</>
	);
}

interface SourceComparisonProps {
	readonly row: GroupRow;
}

function SourceComparison({
	row,
}: SourceComparisonProps): React.JSX.Element | null {
	const { checkpoint } = row;
	const query = useQuery({
		...runRecordQuery(checkpoint?.run ?? ""),
		enabled: row.mode === "stage" && checkpoint !== undefined,
	});
	if (row.mode !== "stage" || checkpoint === undefined) {
		return null;
	}
	const summary = row.stageSummaries.find(
		(item) => item.stage === checkpoint.stage,
	);
	const groupGrade =
		summary?.grades.state === "available"
			? `median ${summary.grades.median}`
			: "grade unavailable";
	return (
		<section
			id="source-comparison"
			className="rounded-lg border border-divider bg-card p-4"
		>
			<h2>
				<SectionLabel>Source & replay · exploratory</SectionLabel>
			</h2>
			<p className="mt-2 max-w-prose text-12 text-muted-foreground">
				This compares the source step with repeated replays from its checkpoint.
				There is no control here, so the difference makes no causal or
				equivalence claim.
			</p>
			<p className="mt-1 text-12 text-dim">
				Group cost includes preflight and all reps; source cost covers one step.
			</p>
			<p className="mt-2 text-12">
				Group: {groupGrade} · {summary?.graded ?? NO_GRADED_REPS} of {row.reps}{" "}
				graded · {row.reps - (summary?.graded ?? NO_GRADED_REPS)} without a step
				grade · {costLine(row)}
			</p>
			<SourceStepReading
				record={query.data}
				stageName={checkpoint.stage}
				loading={query.isLoading}
				error={query.isError ? query.error.message : undefined}
			/>
			<SourceRunLink checkpoint={checkpoint} />
		</section>
	);
}

interface SourceRunLinkProps {
	readonly checkpoint: NonNullable<GroupRow["checkpoint"]>;
}

function SourceRunLink({ checkpoint }: SourceRunLinkProps): React.JSX.Element {
	return (
		<Link
			to="/runs/$run"
			params={{ run: checkpoint.run }}
			search={{ step: checkpoint.stage, view: "results" }}
			className="mt-2 inline-block text-14 text-link underline"
		>
			Source run · {checkpoint.stage}
		</Link>
	);
}

export { SourceComparison as default };
