import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { InferResponseType } from "hono/client";
import { corpusMeasurementReading } from "#benchmark/corpus-version-label";
import { apiClient } from "#client/api-client";
import { attemptLabel } from "#client/attempt-label";
import { runRecordQuery } from "#client/monitor/run-record-query";
import type {
	MonitoredStage,
	RunRecordResponse,
} from "#client/monitor/run-record-query";
import { withinCase } from "#client/within-case";
import { plural } from "#client/plural";
import { outcomeReading } from "#client/run-detail/task-grade-card";
import { ScreenHeader } from "#client/system/components/screen-header";
import { SectionLabel } from "#client/system/components/section-label";
import { clockReading, spendReading } from "./run-progress";
import { runHistoryQuery } from "./run-history-query";
import type { RunHistoryResponse } from "./run-history-query";

type GroupRow = Extract<RunHistoryResponse["rows"][number], { kind: "group" }>;
export type GroupReads = InferResponseType<
	(typeof apiClient.api.groups)[":groupId"]["reads"]["$get"],
	200
>;

async function readGroupReads(groupId: string): Promise<GroupReads> {
	const response = await apiClient.api.groups[":groupId"].reads.$get({
		param: { groupId: encodeURIComponent(groupId) },
	});
	if (!response.ok) {
		throw new Error("Could not read the group's frozen instruction reads");
	}
	return response.json();
}

interface GroupReadsQuery {
	readonly queryKey: readonly ["group-reads", string];
	readonly queryFn: () => Promise<GroupReads>;
}

function groupReadsQuery(groupId: string): GroupReadsQuery {
	return {
		queryKey: ["group-reads", groupId],
		queryFn: () => readGroupReads(groupId),
	} as const;
}

function ReadingPanel({
	groupId,
}: {
	readonly groupId: string;
}): React.JSX.Element {
	const query = useQuery(groupReadsQuery(groupId));
	return (
		<section className="rounded-lg border border-divider bg-card p-4">
			<h2>
				<SectionLabel>Frozen instruction reads</SectionLabel>
			</h2>
			{query.isLoading ? (
				<p className="mt-2 text-12 text-dim">Loading reads…</p>
			) : null}
			{query.isError ? (
				<p role="alert" className="mt-2 text-12 text-dim">
					{query.error.message}
				</p>
			) : null}
			{query.data?.reasons.map((reason) => (
				<p key={reason} className="mt-2 text-12 text-muted-foreground">
					{reason}
				</p>
			))}
			{query.data?.reps.length === 0 ? (
				<p className="mt-2 text-12 text-muted-foreground">
					No rep read manifest was recorded.
				</p>
			) : null}
			<ul className="mt-2 flex flex-col gap-2">
				{query.data?.reps.map((rep) => (
					<li
						key={`${rep.repId}:${rep.stage}`}
						className="border-t border-subtle pt-2"
					>
						<p className="font-mono text-11-5">
							{rep.repId} · {rep.stage}
						</p>
						{rep.readManifest.length === 0 ? (
							<p className="text-11-5 text-dim">No files recorded</p>
						) : null}
						<ul className="mt-1 flex flex-col gap-1">
							{rep.readManifest.map((read) => (
								<li
									key={`${read.path}:${read.role}`}
									className="flex flex-wrap gap-x-2 text-11-5"
								>
									<span className="font-mono">{read.path}</span>
									<span className="text-dim">{read.role}</span>
									{"state" in read ? (
										<span className="text-secondary-foreground">
											{read.state}
										</span>
									) : (
										<span className="text-dim">not judged</span>
									)}
								</li>
							))}
						</ul>
					</li>
				))}
			</ul>
		</section>
	);
}

function costLine(row: GroupRow): string {
	if (row.cost.state === "unavailable") {
		return `Cost unavailable: ${row.cost.reasons.join("; ")}`;
	}
	return `Recorded group total ${spendReading(row.cost.usd)}${row.cost.missing.length === 0 ? ` · mean ${spendReading(row.cost.usd / row.reps)} per requested rep, including preflight` : ` · mean unavailable (${plural(row.cost.missing.length, "missing cost part")})`}`;
}

function StageResults({ row }: { readonly row: GroupRow }): React.JSX.Element {
	return (
		<section className="rounded-lg border border-divider bg-card p-4">
			<h2>
				<SectionLabel>Step results</SectionLabel>
			</h2>
			{row.stageSummaries.length === 0 ? (
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

function FinalResults({ row }: { readonly row: GroupRow }): React.JSX.Element {
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
			<p className="mt-2 text-11-5 text-dim">
				{row.successful} of {row.reps} reps successful · {row.unreadReps.length}{" "}
				unread
			</p>
		</section>
	);
}

function sourceCost(stage: MonitoredStage): string {
	const parts = [
		{ name: "session", reading: stage.sessionCost },
		{ name: "judge", reading: stage.judgeCost },
	];
	const known = parts.flatMap(({ reading }) =>
		reading.state === "available" ? [reading.usd] : [],
	);
	const missing = parts.flatMap(({ name, reading }) =>
		reading.state === "unavailable"
			? [`${name}: ${reading.reasons.join("; ")}`]
			: [],
	);
	const sum = known.reduce((total, usd) => total + usd, 0);
	return missing.length === 0
		? spendReading(sum)
		: `${known.length === 0 ? "" : `${spendReading(sum)} recorded · `}cost incomplete (${missing.join("; ")})`;
}

function SourceStepReading({
	record,
	stageName,
	loading,
	error,
}: {
	readonly record: RunRecordResponse | undefined;
	readonly stageName: string;
	readonly loading: boolean;
	readonly error: string | undefined;
}): React.JSX.Element {
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
					· {sourceCost(stage)} ·{" "}
					{stage.wallTime.state === "available"
						? clockReading(stage.wallTime.ms)
						: `wall time unavailable (${stage.wallTime.reasons.join("; ")})`}{" "}
					· {corpusMeasurementReading(stage.corpusVersion)}
				</p>
			)}
			{outcome === undefined ? null : (
				<p className="mt-1 text-11-5 text-dim">
					Source workflow outcome: {outcome.value} · {outcome.note}
				</p>
			)}
		</>
	);
}

function SourceComparison({
	row,
}: {
	readonly row: GroupRow;
}): React.JSX.Element | null {
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
		<section className="rounded-lg border border-divider bg-card p-4">
			<h2>
				<SectionLabel>Source & replay · exploratory</SectionLabel>
			</h2>
			<p className="mt-2 max-w-prose text-12 text-muted-foreground">
				This compares the source step with repeated replays from its checkpoint.
				There is no control here, so the difference makes no causal or
				equivalence claim.
			</p>
			<p className="mt-1 text-11-5 text-dim">
				Group cost includes preflight and all reps; source cost covers one step.
			</p>
			<p className="mt-2 text-12">
				Group: {groupGrade} · {summary?.graded ?? 0} of {row.reps} graded ·{" "}
				{row.reps - (summary?.graded ?? 0)} without a step grade ·{" "}
				{costLine(row)}
			</p>
			<SourceStepReading
				record={query.data}
				stageName={checkpoint.stage}
				loading={query.isLoading}
				error={query.isError ? query.error.message : undefined}
			/>
			<Link
				to="/runs/$run"
				params={{ run: checkpoint.run }}
				search={{ view: "results", step: checkpoint.stage }}
				className="mt-2 inline-block text-12 text-accent-foreground underline"
			>
				Source run · {checkpoint.stage}
			</Link>
		</section>
	);
}

function Results({ row }: { readonly row: GroupRow }): React.JSX.Element {
	return (
		<div className="flex flex-col gap-4">
			<div className="grid gap-4 lg:grid-cols-2">
				<StageResults row={row} />
				<FinalResults row={row} />
			</div>
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

function Attempts({ row }: { readonly row: GroupRow }): React.JSX.Element {
	return (
		<section className="rounded-lg border border-divider bg-card p-4">
			<h2>
				<SectionLabel>Attempts</SectionLabel>
			</h2>
			<ul aria-label="Saved rep results" className="mt-2 flex flex-col gap-2">
				{row.repAttempts.length === 0 ? (
					<li className="text-12 text-dim">No rep result was recorded.</li>
				) : null}
				{row.repAttempts.map(({ repId, attempt }) => (
					<li key={repId} className="border-t border-subtle pt-2 text-12">
						<Link
							to="/groups/$groupId/reps/$repId/attempt"
							params={{ groupId: row.groupId, repId }}
							search={{ view: "results" }}
							className="text-accent-foreground underline"
						>
							{repId} · {attemptLabel(attempt)} results
						</Link>
					</li>
				))}
			</ul>
			<p className="mt-3 text-11-5 text-dim">Saved session context</p>
			<ul aria-label="Group attempts" className="mt-2 flex flex-col gap-2">
				{row.links.length === 0 ? (
					<li className="text-12 text-dim">No rep contexts were recorded.</li>
				) : null}
				{row.links.map((link) => (
					<li key={link.label} className="border-t border-subtle pt-2 text-12">
						{link.state === "available" ? (
							<Link
								to={link.href}
								search={{ view: "context" }}
								className="text-accent-foreground underline"
							>
								{link.label}
							</Link>
						) : (
							<span>
								{link.label} · {link.reason}
							</span>
						)}
					</li>
				))}
				{row.unreadReps.map((rep) => (
					<li key={rep.repId} className="text-12 text-dim">
						{rep.repId}: {rep.reason}
					</li>
				))}
			</ul>
		</section>
	);
}

function stalenessLine(row: GroupRow): string {
	if (row.staleness.state === "unavailable") {
		return `Staleness not judged: ${row.staleness.reasons.join("; ")}`;
	}
	return row.staleness.stale
		? "Corpus changed since this group"
		: "Corpus still matches this group";
}

export function GroupWorkspacePage({
	groupId,
}: {
	readonly groupId: string;
}): React.JSX.Element {
	const query = useQuery(runHistoryQuery);
	const [view, setView] = useState<"results" | "attempts">("results");
	const row = query.data?.rows.find(
		(candidate): candidate is GroupRow =>
			candidate.kind === "group" && candidate.groupId === groupId,
	);
	if (query.isLoading) {
		return <p className="px-6 py-4 text-muted-foreground">Loading group…</p>;
	}
	if (query.isError) {
		return (
			<p role="alert" className="px-6 py-4 text-muted-foreground">
				Could not load the group history.
			</p>
		);
	}
	if (row === undefined) {
		return (
			<p role="alert" className="px-6 py-4 text-muted-foreground">
				No saved group {groupId} was found.
			</p>
		);
	}
	return (
		<div>
			<ScreenHeader
				title={`Group ${withinCase(row.shortId ?? row.groupId.slice(0, 8), row.caseId)}`}
				subline={`${row.caseId} · ${row.mode} · ${plural(row.reps, "rep")}${row.shortId === undefined ? "" : ` · ${row.shortId}`}`}
				lead={
					<Link to="/" className="text-11-5 text-accent-foreground underline">
						← Runs
					</Link>
				}
			/>
			<nav
				aria-label="Group views"
				className="flex gap-1 border-b border-divider px-6"
			>
				{(["results", "attempts"] as const).map((item) => (
					<button
						key={item}
						type="button"
						aria-pressed={view === item}
						onClick={() => {
							setView(item);
						}}
						className="border-b-2 border-transparent px-3 py-2.5 text-12 text-muted-foreground aria-pressed:border-primary aria-pressed:text-foreground hover:text-foreground"
					>
						{item === "results" ? "Results" : "Attempts"}
					</button>
				))}
			</nav>
			<div className="flex max-w-7xl flex-col gap-4 px-6 pt-4 pb-12">
				<section className="rounded-lg border border-divider bg-card p-4 text-12">
					<h2>
						<SectionLabel>Setup & provenance</SectionLabel>
					</h2>
					<p className="mt-2">
						Record {row.groupId}
						<br />
						Frozen {corpusMeasurementReading(row.corpusVersion)} ·{" "}
						{row.startedAt ?? "start time not recorded"}
					</p>
					<p className="text-dim">{stalenessLine(row)}</p>
					{row.checkpoint === undefined ? (
						<p className="text-dim">No source checkpoint recorded.</p>
					) : (
						<p>
							From{" "}
							<Link
								to="/runs/$run"
								params={{ run: row.checkpoint.run }}
								search={{ view: "results", step: row.checkpoint.stage }}
								className="text-accent-foreground underline"
							>
								source run · {row.checkpoint.stage}
							</Link>
						</p>
					)}
				</section>
				{view === "results" ? <Results row={row} /> : <Attempts row={row} />}
				<ReadingPanel groupId={groupId} />
				<Link
					to="/comparisons"
					className="self-start text-12 text-accent-foreground underline"
				>
					Browse saved comparisons
				</Link>
			</div>
		</div>
	);
}
