import { useQuery } from "@tanstack/react-query";

import type { Immutable } from "#benchmark/contracts";
import { corpusMeasurementReading } from "#benchmark/corpus-version-label";
import { clockReading, spendReading } from "#client/run-history/run-progress";
import Metric from "#client/system/components/metric";
import StateBadge from "#client/system/components/state-badge";

import type { ReplayRow, SessionRow } from "./attempt-record-identity";
import type { ConfirmationRepResult } from "./confirmation-rep-query";
import ReplaySourceComparison from "./replay-source-comparison";
import { sessionHistoryQuery } from "./session-history-page";

const NO_SPEND_USD = 0;

const EMPTY_COLLECTION_LENGTH = 0;

function costReading(cost: SessionRow["cost"]): string {
	if (cost.state === "unavailable") {
		return `Unavailable: ${cost.reasons.join("; ")}`;
	}
	return `${spendReading(cost.usd)}${cost.missing.length === EMPTY_COLLECTION_LENGTH ? "" : ` recorded; incomplete: ${cost.missing.map(({ part, reason }) => `${part}: ${reason}`).join("; ")}`}`;
}

function timeReading(time: SessionRow["wallTime"]): string {
	return time.state === "available"
		? clockReading(time.ms)
		: `Unavailable: ${time.reasons.join("; ")}`;
}

interface SessionResultsProps {
	readonly row: SessionRow;
	readonly assessmentAvailable: boolean;
}

function SessionResults({
	row,
	assessmentAvailable,
}: SessionResultsProps): React.JSX.Element {
	return (
		<section className="rounded-lg border border-divider bg-card p-4">
			<h2 className="text-16 font-semibold">Saved session measurements</h2>
			{assessmentAvailable ? null : (
				<StateBadge tone="neutral">Recorded outcome: {row.status}</StateBadge>
			)}
			<p className="mt-2 text-12 text-dim">
				Execution ended
				{assessmentAvailable
					? ""
					: " · recorded outcome uses reply/transcript checks; saved state checks are separate below."}
			</p>
			<dl className="mt-4 flex flex-wrap gap-6">
				{assessmentAvailable ? null : (
					<Metric
						label="Reply/transcript checks"
						value={
							row.checks.state === "available"
								? `${String(row.checks.passed)} of ${String(row.checks.declared)} reply/transcript checks passed`
								: `Unavailable: ${row.checks.reasons.join("; ")}`
						}
					/>
				)}
				<Metric label="Cost" value={costReading(row.cost)} />
				<Metric label="Wall time" value={timeReading(row.wallTime)} />
				<Metric
					label="Corpus"
					value={corpusMeasurementReading(row.corpusVersion)}
				/>
				<Metric label="Started" value={row.startedAt ?? "Not recorded"} />
			</dl>
		</section>
	);
}

interface ReplayResultsProps {
	readonly row: ReplayRow;
	readonly lineage: string;
	readonly timestamp: string;
}

function ReplayResults({
	row,
	lineage,
	timestamp,
}: ReplayResultsProps): React.JSX.Element {
	const source = useQuery(
		sessionHistoryQuery({ kind: "replay", lineage, timestamp }),
	);
	const sourceRun =
		source.data?.attempt.kind === "session"
			? undefined
			: source.data?.attempt.run;
	return (
		<section className="rounded-lg border border-divider bg-card p-4">
			<h2 className="text-16 font-semibold">Saved replay result</h2>
			<p className="mt-2 font-mono text-12">
				{row.stage} · Grade {row.grade} · {row.status}
			</p>
			<p className="mt-1 text-12 text-dim">
				Execution ended · {row.finalOutcome.reason}
			</p>
			<details className="mt-3 text-12 text-dim">
				<summary className="cursor-pointer">Replay provenance</summary>
				<code className="mt-2 block select-all wrap-anywhere">
					{row.lineage} · {row.timestamp}
				</code>
			</details>
			<dl className="mt-4 flex flex-wrap gap-6">
				<Metric label="Cost" value={costReading(row.cost)} />
				<Metric label="Wall time" value={timeReading(row.wallTime)} />
				<Metric
					label="Corpus"
					value={corpusMeasurementReading(row.corpusVersion)}
				/>

				<Metric label="Recorded at" value={row.timestamp} />
			</dl>
			{sourceRun === undefined ? (
				<p className="mt-3 text-12 text-dim">
					{source.isLoading
						? "Reading source run…"
						: "Source run link unavailable from saved history."}
				</p>
			) : (
				<ReplaySourceComparison sourceRun={sourceRun} row={row} />
			)}
		</section>
	);
}

function stageReading(
	stage: Immutable<ConfirmationRepResult["stages"][number]>,
): string {
	if (stage.status === "JUDGED") {
		return `Grade ${stage.grade} · ${stage.verdict}`;
	}
	return `Unavailable: ${stage.status} · ${stage.status === "NOT_REACHED" ? stage.reason : stage.error}`;
}

function sessionCheckReading(
	stage: Immutable<ConfirmationRepResult["stages"][number]>,
): string {
	if (stage.status !== "JUDGED") {
		return stageReading(stage);
	}
	return stage.verdict === "CONTINUE"
		? "Reply/transcript checks passed"
		: "Reply/transcript checks failed";
}

function finalOutcomeReading(
	outcome: Immutable<ConfirmationRepResult["finalOutcome"]>,
): string {
	if (outcome.status === "JUDGED") {
		return outcome.verdict;
	}
	if (outcome.status === "NOT_APPLICABLE") {
		return "Not applicable to this rep mode";
	}
	return `${outcome.status} · ${outcome.status === "NOT_REACHED" ? outcome.reason : outcome.error}`;
}

interface ConfirmationResultsProps {
	readonly record: Immutable<ConfirmationRepResult> | undefined;
	readonly loading: boolean;
	readonly error: boolean;
	readonly sessionAssessmentAvailable: boolean;
}

function ConfirmationResults({
	record: rep,
	loading,
	error,
	sessionAssessmentAvailable,
}: ConfirmationResultsProps): React.JSX.Element {
	const showOutcome = rep?.mode !== "session" || !sessionAssessmentAvailable;
	const recordedCost =
		rep === undefined || rep.metrics.calls.length === EMPTY_COLLECTION_LENGTH
			? undefined
			: rep.metrics.calls.reduce(
					(total, call) => total + call.metrics.costUsd,
					NO_SPEND_USD,
				);
	return (
		<section className="rounded-lg border border-divider bg-card p-4">
			<h2 className="text-16 font-semibold">Saved rep result</h2>
			<p className="mt-1 text-12 text-dim">
				Measurements below belong to this rep only.
			</p>
			{loading ? (
				<p className="mt-3 text-12 text-dim">Loading rep record…</p>
			) : null}
			{error ? (
				<p role="alert" className="mt-3 text-12 text-dim">
					Individual rep result unavailable from its saved record.
				</p>
			) : null}
			{rep === undefined ? null : (
				<>
					{showOutcome ? (
						<StateBadge tone="neutral">
							Recorded outcome: {rep.outcome}
						</StateBadge>
					) : null}
					<RepMeasurements
						rep={rep}
						showOutcome={showOutcome}
						recordedCost={recordedCost}
					/>
				</>
			)}
		</section>
	);
}

interface RepMeasurementsProps {
	readonly rep: Immutable<ConfirmationRepResult>;
	readonly showOutcome: boolean;
	readonly recordedCost: number | undefined;
}

function RepMeasurements({
	rep,
	showOutcome,
	recordedCost,
}: RepMeasurementsProps): React.JSX.Element {
	return (
		<dl className="mt-4 flex flex-wrap gap-6">
			<Metric label="Mode" value={rep.mode} />
			{showOutcome
				? rep.stages.map((stage) => (
						<Metric
							key={stage.stage}
							label={stage.stage}
							value={
								rep.mode === "session"
									? sessionCheckReading(stage)
									: stageReading(stage)
							}
						/>
					))
				: null}
			<Metric
				label="Cost"
				value={
					recordedCost === undefined
						? "Unavailable: no call metrics recorded"
						: `${spendReading(recordedCost)}${rep.metrics.status === "MISSING" ? ` recorded; incomplete: ${rep.metrics.missing.join("; ")}` : ""}`
				}
			/>
			<Metric label="Wall time" value={clockReading(rep.elapsedMs)} />
			<Metric label="Case" value={rep.caseId} />
			{rep.mode === "pipeline" ? (
				<Metric
					label="Final workflow outcome"
					value={finalOutcomeReading(rep.finalOutcome)}
				/>
			) : null}
		</dl>
	);
}

export { ConfirmationResults, ReplayResults, SessionResults, stageReading };
