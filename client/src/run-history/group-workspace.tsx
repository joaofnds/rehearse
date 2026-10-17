import { Link, useNavigate } from "@tanstack/react-router";
import type { Immutable } from "#benchmark/contracts";
import { groupAttemptsQuery } from "#client/session-history/group-attempts-query";
import { useQuery, useQueries } from "@tanstack/react-query";
import { attemptEvidenceQuery } from "#client/session-history/attempt-evidence-query";
import { SummaryPanel } from "#client/system/components/summary-panel";
import { Metric } from "#client/system/components/metric";
import { StateBadge } from "#client/system/components/state-badge";
import { confirmationRepQuery } from "#client/session-history/confirmation-rep-query";
import type { ConfirmationRepResult as RepResult } from "#client/session-history/confirmation-rep-query";
import type { InferResponseType } from "hono/client";
import { corpusMeasurementReading } from "#benchmark/corpus-version-label";
import { apiClient } from "#client/api-client";
import { runRecordQuery } from "#client/monitor/run-record-query";
import type { RunRecordResponse } from "#client/monitor/run-record-query";
import { withinCase } from "#client/within-case";
import { plural } from "#client/plural";
import { outcomeReading } from "#client/run-detail/task-grade-card";
import { ScreenHeader } from "#client/system/components/screen-header";
import { Button } from "#client/system/ui/button";
import { stageCostReading } from "#client/run-detail/step-readings";
import { SectionLabel } from "#client/system/components/section-label";
import { clockReading, spendReading } from "./run-progress";
import { runHistoryQuery } from "./run-history-query";
import { useRunsReturnSearch } from "./run-discovery";
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
						<p className="font-mono text-12">
							{rep.repId} · {rep.stage}
						</p>
						{rep.readManifest.length === 0 ? (
							<p className="text-12 text-dim">No files recorded</p>
						) : null}
						<ul className="mt-1 flex flex-col gap-1">
							{rep.readManifest.map((read) => (
								<li
									key={`${read.path}:${read.role}`}
									className="flex flex-wrap gap-x-2 text-12"
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
			<p className="mt-2 text-12 text-dim">
				{row.successful} of {row.reps} reps successful · {row.unreadReps.length}{" "}
				unread
			</p>
		</section>
	);
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
				className="mt-2 inline-block text-14 text-link underline"
			>
				Source run · {checkpoint.stage}
			</Link>
		</section>
	);
}

function SessionGroupResults({
	row,
}: {
	readonly row: GroupRow;
}): React.JSX.Element {
	const index = useQuery(groupAttemptsQuery(row.groupId));
	const refs = index.data?.repRecords ?? row.repAttempts;
	const results = useQueries({
		queries: refs.map(({ repId }) =>
			attemptEvidenceQuery(`rep:session:${row.groupId}/${repId}`),
		),
	});
	if (index.isPending || results.some(({ isPending }) => isPending)) {
		return (
			<SummaryPanel
				title="Session repetitions"
				description="Recorded outcomes use reply/transcript checks. Saved state checks remain a separate assessment."
			>
				<p className="text-14 text-dim">Reading saved state checks…</p>
			</SummaryPanel>
		);
	}
	const assessed = results.flatMap(({ data }) =>
		data?.state === "available" &&
		data.kind === "session" &&
		data.record.stateResults !== undefined &&
		data.record.stateResults.length > 0
			? [data.record]
			: [],
	);
	const allPassed = assessed.filter(
		({ stateResults }) =>
			stateResults?.every(({ status }) => status === "PASS") === true,
	).length;
	const missing = row.reps - assessed.length;

	return (
		<SummaryPanel
			title="Session repetitions"
			description="Recorded outcomes use reply/transcript checks. Saved state checks remain a separate assessment."
		>
			<dl className="flex flex-wrap gap-6">
				<Metric
					label="Recorded outcome"
					value={`${String(row.successful)} of ${String(row.reps)} recorded successful on reply/transcript checks`}
					hint={`${String(row.unreadReps.length)} unread result records`}
				/>
				<Metric
					label="Saved state assessment"
					value={`${String(allPassed)} of ${String(assessed.length)} assessed attempts passed every saved state check`}
					hint={`${String(assessed.length)} of ${String(row.reps)} attempts have saved state checks`}
				/>
			</dl>

			{missing > 0 ? (
				<p className="mt-3 text-14 text-dim">
					{missing}{" "}
					{missing === 1 ? "attempt unavailable" : "attempts unavailable"} or
					without saved state checks
				</p>
			) : null}
			{assessed.length > allPassed ? (
				<p className="mt-3 text-14">
					{assessed.length - allPassed} assessed{" "}
					{assessed.length - allPassed === 1 ? "attempt has" : "attempts have"}{" "}
					failed saved state checks. Inspect Attempts for their recorded outcome
					and evidence.
				</p>
			) : null}
		</SummaryPanel>
	);
}

function SessionRepState({
	groupId,
	repId,
}: {
	readonly groupId: string;
	readonly repId: string;
}): React.JSX.Element {
	const evidence = useQuery(
		attemptEvidenceQuery(`rep:session:${groupId}/${repId}`),
	);
	const record =
		evidence.data?.state === "available" && evidence.data.kind === "session"
			? evidence.data.record
			: undefined;
	if (record?.stateResults === undefined || record.stateResults.length === 0) {
		return (
			<p className="mt-1 text-12 text-dim">
				{evidence.isLoading
					? "Reading state checks…"
					: "Saved state checks unavailable"}
			</p>
		);
	}
	const passed = record.stateResults.filter(
		({ status }) => status === "PASS",
	).length;

	return (
		<p className="mt-1">
			<StateBadge
				tone={passed < record.stateResults.length ? "negative" : "positive"}
			>
				{passed} of {record.stateResults.length} saved state checks passed
			</StateBadge>
		</p>
	);
}

function Results({ row }: { readonly row: GroupRow }): React.JSX.Element {
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

function repStageReading(
	item: Immutable<RepResult["stages"][number]>,
	mode: GroupRow["mode"],
): string {
	if (item.status !== "JUDGED") {
		return item.status.replaceAll("_", " ");
	}
	if (mode === "session") {
		return item.verdict === "CONTINUE"
			? "Reply/transcript checks passed"
			: "Reply/transcript checks failed";
	}
	return `Grade ${item.grade} · ${item.verdict}`;
}
function repCoverage(rep: Immutable<RepResult> | undefined): string {
	if (rep === undefined) {
		return "Evidence unavailable";
	}
	return rep.metrics.status === "COMPLETE"
		? "Call metrics complete"
		: rep.metrics.missing.join("; ");
}
function RepOutcomes({
	rep,
	loading,
	mode,
}: {
	readonly rep: Immutable<RepResult> | undefined;
	readonly loading: boolean;
	readonly mode: GroupRow["mode"];
}): React.JSX.Element {
	if (rep === undefined) {
		return <>{loading ? "Reading…" : "Result unavailable"}</>;
	}
	return (
		<>
			<p>Recorded outcome: {rep.outcome}</p>
			{rep.stages.map((item) => (
				<p key={item.stage}>
					{item.stage}: {repStageReading(item, mode)}
				</p>
			))}
		</>
	);
}
function AttemptRow({
	row,
	repId,
	ordinal,
	step,
	comparison,
}: {
	readonly row: GroupRow;
	readonly repId: string;
	readonly ordinal?: number | undefined;
	readonly step?: string | undefined;
	readonly comparison?: string | undefined;
}): React.JSX.Element {
	const result = useQuery(confirmationRepQuery(row.groupId, repId));
	const rep = result.data;
	const total = rep?.metrics.calls.reduce(
		(sum, call) => sum + call.metrics.costUsd,
		0,
	);
	const params = { groupId: row.groupId, repId };
	const contextPath = `/groups/${encodeURIComponent(row.groupId)}/reps/${encodeURIComponent(repId)}/attempt`;
	const contextLink = row.links.find(
		(link) => link.state === "available" && link.href === contextPath,
	);
	const contextAvailable = contextLink?.state === "available";
	const search = {
		...(step !== undefined && { step }),
		...(comparison !== undefined && { comparison }),
	};
	return (
		<tr className="border-t border-subtle align-top text-12">
			<td className="py-3 pr-4">
				<p className="font-medium">
					{ordinal === undefined
						? "Saved repetition"
						: `Repetition ${String(ordinal)}`}
				</p>
				<code className="text-12 text-dim">{repId}</code>
			</td>
			<td className="py-3 pr-4">
				<RepOutcomes rep={rep} loading={result.isLoading} mode={row.mode} />
				{row.mode === "session" ? (
					<SessionRepState groupId={row.groupId} repId={repId} />
				) : null}
			</td>
			<td className="py-3 pr-4 font-mono">
				{rep === undefined || rep.metrics.calls.length === 0
					? "Cost unavailable"
					: `${spendReading(total ?? 0)}${rep.metrics.status === "MISSING" ? " recorded; incomplete" : ""}`}
				<p className="mt-1 text-dim">
					{rep === undefined ? "Time unavailable" : clockReading(rep.elapsedMs)}
				</p>
			</td>
			<td className="py-3 pr-4">
				{corpusMeasurementReading(row.corpusVersion)}
				<p className="mt-1 text-dim">{repCoverage(rep)}</p>
			</td>
			<td className="py-3">
				<div className="flex flex-wrap gap-3">
					<Link
						to="/groups/$groupId/reps/$repId/attempt"
						params={params}
						search={{ view: "results", ...search }}
						className="text-link underline"
					>
						Results
					</Link>
					{contextAvailable ? (
						<Link
							to="/groups/$groupId/reps/$repId/attempt"
							params={params}
							search={{ view: "context", ...search }}
							className="text-link underline"
						>
							Context & cost
						</Link>
					) : (
						<span className="text-dim">
							{row.mode === "session"
								? "Context unavailable"
								: "No session context"}
						</span>
					)}
				</div>
			</td>
		</tr>
	);
}

function Attempts({
	row,
	step,
	comparison,
}: {
	readonly row: GroupRow;
	readonly step?: string | undefined;
	readonly comparison?: string | undefined;
}): React.JSX.Element {
	const group = useQuery(groupAttemptsQuery(row.groupId));
	let refs: readonly {
		readonly repId: string;
		readonly ordinal?: number | undefined;
	}[] = row.repAttempts.map(({ repId }) => ({ repId }));
	if (group.data !== undefined) {
		refs = group.data.repRecords;
	}
	return (
		<section className="rounded-lg border border-divider bg-card p-4">
			<h2>
				<SectionLabel>Attempts</SectionLabel>
			</h2>
			<p className="mt-2 text-12 text-dim">
				Each repetition keeps its outcome, recorded cost and evidence together.
				Detailed output and checks depend on what that record retained.
			</p>
			<div className="mt-3 overflow-x-auto">
				<table aria-label="Group attempts" className="w-full text-left">
					<thead className="text-12 text-dim">
						<tr>
							<th className="pr-4 pb-2">Attempt</th>
							<th className="pr-4 pb-2">Outcome & steps</th>
							<th className="pr-4 pb-2">Cost & time</th>
							<th className="pr-4 pb-2">Corpus & coverage</th>
							<th className="pb-2">Evidence</th>
						</tr>
					</thead>
					<tbody>
						{refs.map((rep) => (
							<AttemptRow
								key={rep.repId}
								row={row}
								repId={rep.repId}
								ordinal={rep.ordinal}
								step={step}
								comparison={comparison}
							/>
						))}
					</tbody>
				</table>
			</div>
			{refs.length === 0 ? (
				<p className="mt-3 text-14 text-dim">No rep results were recorded.</p>
			) : null}
			{row.links
				.filter((link) => link.state === "unavailable")
				.map((link) => (
					<p key={link.label} className="mt-2 text-12 text-dim">
						{link.label} · {link.reason}
					</p>
				))}
			{row.unreadReps.map((rep) => (
				<p key={rep.repId} className="mt-2 text-12 text-dim">
					{rep.repId}: {rep.reason}
				</p>
			))}
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
	view,
	step,
	comparison,
}: {
	readonly groupId: string;
	readonly view: "results" | "attempts";
	readonly step?: string | undefined;
	readonly comparison?: string | undefined;
}): React.JSX.Element {
	const returnSearch = useRunsReturnSearch();
	const query = useQuery(runHistoryQuery);
	const navigate = useNavigate();
	const row = query.data?.rows.find(
		(candidate): candidate is GroupRow =>
			candidate.kind === "group" && candidate.groupId === groupId,
	);
	if (query.isLoading) {
		return (
			<p className="page-gutter py-4 text-muted-foreground">Loading group…</p>
		);
	}
	if (query.isError) {
		return (
			<p role="alert" className="page-gutter py-4 text-attention">
				Could not load the group history.
			</p>
		);
	}
	if (row === undefined) {
		return (
			<p role="alert" className="page-gutter py-4 text-attention">
				No saved group {groupId} was found.
			</p>
		);
	}
	return (
		<div>
			<ScreenHeader
				title={`Group ${withinCase(row.shortId ?? row.groupId.slice(0, 8), row.caseId)}`}
				subline={`${row.caseId} · ${row.mode} · ${plural(row.reps, "rep")}${row.shortId === undefined ? "" : ` · ${row.shortId}`}`}
				aside={
					row.mode === "stage" && row.checkpoint !== undefined ? (
						<Button asChild size="sm">
							<Link
								to="/groups/$groupId"
								params={{ groupId }}
								search={{
									view: "results",
									...(step !== undefined && { step }),
									...(comparison !== undefined && { comparison }),
								}}
								hash="source-comparison"
							>
								Compare with source
							</Link>
						</Button>
					) : undefined
				}
				lead={
					<Link
						to="/"
						search={returnSearch}
						className="text-14 text-link underline"
					>
						← Runs
					</Link>
				}
			/>
			<nav
				aria-label="Group views"
				className="flex gap-1 border-b border-divider page-gutter"
			>
				{(["results", "attempts"] as const).map((item) => (
					<button
						key={item}
						type="button"
						aria-pressed={view === item}
						onClick={() => {
							void navigate({
								to: "/groups/$groupId",
								params: { groupId },
								search: {
									view: item,
									...(step !== undefined && { step }),
									...(comparison !== undefined && { comparison }),
								},
							});
						}}
						className="border-b-2 border-transparent px-3 py-2.5 text-14 text-muted-foreground aria-pressed:border-primary aria-pressed:text-foreground hover:text-foreground"
					>
						{item === "results" ? "Results" : "Attempts"}
					</button>
				))}
			</nav>
			<div className="flex max-w-7xl flex-col gap-4 page-gutter pt-8 pb-12">
				<details className="rounded-lg border border-divider bg-card p-4 text-12">
					<summary className="cursor-pointer">Setup &amp; provenance</summary>
					<p className="mt-2">
						Record{" "}
						<code className="select-all wrap-anywhere">{row.groupId}</code>
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
								className="text-link underline"
							>
								source run · {row.checkpoint.stage}
							</Link>
						</p>
					)}
				</details>
				{view === "results" ? (
					<Results row={row} />
				) : (
					<Attempts row={row} step={step} comparison={comparison} />
				)}
				<details className="rounded-lg border border-divider bg-card p-4 text-14">
					<summary>Frozen instruction reads</summary>
					<div className="mt-3">
						<ReadingPanel groupId={groupId} />
					</div>
				</details>
				{comparison === undefined ? null : (
					<Link
						to="/comparisons/$digest"
						params={{ digest: comparison }}
						className="text-14 text-link underline"
					>
						Back to comparison
					</Link>
				)}
				<Link
					to="/comparisons"
					className="self-start text-14 text-link underline"
				>
					Browse saved comparisons
				</Link>
			</div>
		</div>
	);
}
