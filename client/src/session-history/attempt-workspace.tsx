import { CurrentLink } from "#client/system/components/current-link";
import { withinCase } from "#client/within-case";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { attemptEvidenceQuery } from "./attempt-evidence-query";
import { confirmationRepQuery } from "./confirmation-rep-query";
import type { ConfirmationRepResult } from "./confirmation-rep-query";
import { useState } from "react";
import { groupAttemptsQuery } from "./group-attempts-query";
import type { GroupAttemptIndex } from "./group-attempts-query";
import { Button } from "#client/system/ui/button";
import { AttemptEvidence, savedRecordQuery } from "./attempt-evidence";
import { GroupFinalAssessment } from "./group-final-assessment";
import { ReplaySourceComparison } from "./replay-source-comparison";
import { useRunsReturnSearch } from "#client/run-history/run-discovery";
import { corpusMeasurementReading } from "#benchmark/corpus-version-label";
import type { Immutable } from "#benchmark/contracts";
import { clockReading, spendReading } from "#client/run-history/run-progress";
import { runHistoryQuery } from "#client/run-history/run-history-query";
import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import { ScreenHeader } from "#client/system/components/screen-header";
import { Metric } from "#client/system/components/metric";
import { StateBadge } from "#client/system/components/state-badge";
import {
	SessionHistoryPage,
	sessionHistoryQuery,
} from "./session-history-page";
import type { SessionHistoryIdentity } from "./session-history-page";

type SessionRow = Extract<
	RunHistoryResponse["rows"][number],
	{ kind: "session-attempt" }
>;
type ReplayRow = Extract<
	RunHistoryResponse["rows"][number],
	{ kind: "replay" }
>;
function attemptPath(identity: SessionHistoryIdentity): string {
	switch (identity.kind) {
		case "standalone": {
			return `/attempts/session/${encodeURIComponent(identity.caseId)}/${encodeURIComponent(identity.uuid)}`;
		}
		case "confirmation": {
			return `/groups/${encodeURIComponent(identity.groupId)}/reps/${encodeURIComponent(identity.repId)}/attempt`;
		}
		case "replay": {
			return `/replays/${encodeURIComponent(identity.lineage)}/${encodeURIComponent(identity.timestamp)}`;
		}
		case "stage": {
			return `/runs/${encodeURIComponent(identity.run)}?view=results&step=${encodeURIComponent(identity.stage)}`;
		}
		default: {
			return identity satisfies never;
		}
	}
}

function recordId(
	identity: Exclude<SessionHistoryIdentity, { kind: "stage" }>,
): string {
	switch (identity.kind) {
		case "standalone": {
			return `attempt:session:${identity.caseId}/${identity.uuid}`;
		}
		case "confirmation": {
			return `rep:session:${identity.groupId}/${identity.repId}`;
		}
		case "replay": {
			return `attempt:stage:${identity.lineage}/${identity.timestamp}`;
		}
		default: {
			return identity satisfies never;
		}
	}
}

function costReading(cost: SessionRow["cost"]): string {
	if (cost.state === "unavailable") {
		return `Unavailable: ${cost.reasons.join("; ")}`;
	}
	return `${spendReading(cost.usd)}${cost.missing.length === 0 ? "" : ` recorded; incomplete: ${cost.missing.map(({ part, reason }) => `${part}: ${reason}`).join("; ")}`}`;
}

function timeReading(time: SessionRow["wallTime"]): string {
	return time.state === "available"
		? clockReading(time.ms)
		: `Unavailable: ${time.reasons.join("; ")}`;
}

function SessionResults({
	row,
	assessmentAvailable,
}: {
	readonly row: SessionRow;
	readonly assessmentAvailable: boolean;
}): React.JSX.Element {
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

function ReplayResults({
	row,
	lineage,
	timestamp,
}: {
	readonly row: ReplayRow;
	readonly lineage: string;
	readonly timestamp: string;
}): React.JSX.Element {
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

function ConfirmationResults({
	record: rep,
	loading,
	error,
	sessionAssessmentAvailable,
}: {
	readonly record: Immutable<ConfirmationRepResult> | undefined;
	readonly loading: boolean;
	readonly error: boolean;
	readonly sessionAssessmentAvailable: boolean;
}): React.JSX.Element {
	const showOutcome = rep?.mode !== "session" || !sessionAssessmentAvailable;
	const recordedCost =
		rep === undefined || rep.metrics.calls.length === 0
			? undefined
			: rep.metrics.calls.reduce(
					(total, call) => total + call.metrics.costUsd,
					0,
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
				</>
			)}
		</section>
	);
}

function SelectedRepEvidence({
	selected,
	identity,
}: {
	readonly selected:
		| Immutable<ConfirmationRepResult["stages"][number]>
		| undefined;
	readonly identity: Extract<SessionHistoryIdentity, { kind: "confirmation" }>;
}): React.JSX.Element {
	if (selected === undefined) {
		return <p className="text-14 text-dim">No step outcome was saved.</p>;
	}
	if (selected.status === "JUDGED") {
		return (
			<AttemptEvidence
				id={`rep:stage:${identity.groupId}/${identity.repId}/${selected.stage}`}
			/>
		);
	}
	return (
		<p className="text-14 text-dim">
			{selected.stage}: {stageReading(selected)}. No judged assessment is
			available.
		</p>
	);
}
function RepEvidence({
	identity,
	record,
	step,
	comparison,
}: {
	readonly identity: Extract<SessionHistoryIdentity, { kind: "confirmation" }>;
	readonly record: Immutable<ConfirmationRepResult>;
	readonly step?: string | undefined;
	readonly comparison?: string | undefined;
}): React.JSX.Element {
	const selected =
		step === undefined
			? record.stages[0]
			: record.stages.find((item) => item.stage === step);
	if (record.mode === "session") {
		return <AttemptEvidence id={recordId(identity)} />;
	}
	return (
		<>
			<nav aria-label="Rep steps" className="flex flex-wrap gap-3 text-14">
				{record.stages.map((item) => (
					<CurrentLink
						key={item.stage}
						to={attemptPath(identity)}
						search={{
							view: "results",
							step: item.stage,
							...(comparison !== undefined && { comparison }),
						}}
						marksCurrent={selected?.stage === item.stage}
						className="rounded-md border border-transparent px-3 py-2 text-link underline current:border-primary current:bg-selected current:text-pale current:no-underline"
					>
						{item.stage}
					</CurrentLink>
				))}
			</nav>
			<SelectedRepEvidence selected={selected} identity={identity} />
			{record.mode === "pipeline" ? (
				<GroupFinalAssessment
					groupId={identity.groupId}
					repId={identity.repId}
				/>
			) : null}
		</>
	);
}

function SavedRecord({
	id,
	label = "saved record JSON",
	open,
	onToggle,
	raw,
	loading,
	error,
}: {
	readonly id: string;
	readonly label?: string;
	readonly open: boolean;
	readonly onToggle: () => void;
	readonly raw: string | undefined;
	readonly loading: boolean;
	readonly error: boolean;
}): React.JSX.Element {
	let formatted: string | undefined;
	if (raw !== undefined) {
		try {
			formatted = JSON.stringify(JSON.parse(raw), null, 2);
		} catch {
			formatted = raw;
		}
	}
	return (
		<section className="rounded-lg border border-divider bg-card p-4">
			<button
				type="button"
				aria-expanded={open}
				onClick={onToggle}
				className="text-14 text-link hover:underline"
			>
				{open ? `Hide ${label}` : `Show ${label}`}
			</button>
			{open ? (
				<>
					<p className="mt-2 font-mono text-12 text-dim">{id}</p>
					{loading ? (
						<p className="mt-2 text-12 text-dim">Loading record…</p>
					) : null}
					{error ? (
						<p role="alert" className="mt-2 text-12 text-dim">
							Saved record JSON unavailable.
						</p>
					) : null}
					{formatted === undefined ? null : (
						<pre
							data-testid="saved-record-json"
							className="mt-3 max-h-96 overflow-auto rounded border border-subtle bg-muted p-3 font-mono leading-transcript text-13 whitespace-pre-wrap break-all"
						>
							{formatted}
						</pre>
					)}
				</>
			) : null}
		</section>
	);
}

function StandalonePanel({
	identity,
	assessmentAvailable,
}: {
	readonly identity: Extract<SessionHistoryIdentity, { kind: "standalone" }>;
	readonly assessmentAvailable: boolean;
}): React.JSX.Element {
	const history = useQuery(runHistoryQuery);
	const row = history.data?.rows.find(
		(candidate): candidate is SessionRow =>
			candidate.kind === "session-attempt" &&
			candidate.caseId === identity.caseId &&
			candidate.uuid === identity.uuid,
	);
	if (history.isLoading) {
		return <p className="text-12 text-dim">Loading attempt result…</p>;
	}
	if (history.isError) {
		return (
			<p role="alert" className="text-12 text-dim">
				Could not load saved run listing.
			</p>
		);
	}
	return row === undefined ? (
		<p className="text-12 text-dim">
			This saved attempt has no readable result in Runs.
		</p>
	) : (
		<SessionResults row={row} assessmentAvailable={assessmentAvailable} />
	);
}

function ReplayPanel({
	identity,
}: {
	readonly identity: Extract<SessionHistoryIdentity, { kind: "replay" }>;
}): React.JSX.Element {
	const history = useQuery(runHistoryQuery);
	const row = history.data?.rows.find(
		(candidate): candidate is ReplayRow =>
			candidate.kind === "replay" &&
			candidate.lineage === identity.lineage &&
			candidate.timestamp === identity.timestamp,
	);
	if (history.isLoading) {
		return <p className="text-12 text-dim">Loading replay result…</p>;
	}
	if (history.isError) {
		return (
			<p role="alert" className="text-12 text-dim">
				Could not load saved run listing.
			</p>
		);
	}
	return row === undefined ? (
		<p className="text-12 text-dim">
			This saved replay has no readable result in Runs.
		</p>
	) : (
		<ReplayResults
			row={row}
			lineage={identity.lineage}
			timestamp={identity.timestamp}
		/>
	);
}

function ResultsEvidence({
	identity,
	record,
	step,
	comparison,
}: {
	readonly identity: Exclude<SessionHistoryIdentity, { kind: "stage" }>;
	readonly record: Immutable<ConfirmationRepResult> | undefined;
	readonly step?: string | undefined;
	readonly comparison?: string | undefined;
}): React.JSX.Element | null {
	const id = recordId(identity);
	if (identity.kind === "standalone") {
		return <AttemptEvidence id={id} />;
	}
	if (identity.kind === "replay") {
		return <AttemptEvidence id={id} />;
	}
	if (record === undefined) {
		return null;
	}
	return (
		<RepEvidence
			identity={identity}
			record={record}
			step={step}
			comparison={comparison}
		/>
	);
}
function useHasSessionAssessment(
	identity: Exclude<SessionHistoryIdentity, { kind: "stage" }>,
	mode: ConfirmationRepResult["mode"] | undefined,
): boolean {
	const session =
		identity.kind === "standalone" ||
		(identity.kind === "confirmation" && mode === "session");
	const evidence = useQuery({
		...attemptEvidenceQuery(recordId(identity)),
		enabled: session,
	});
	if (!session || evidence.isError) {
		return false;
	}
	return (
		evidence.data?.state === "available" && evidence.data.kind === "session"
	);
}

function ResultsContent({
	identity,
	step,
	comparison,
}: {
	readonly identity: Exclude<SessionHistoryIdentity, { kind: "stage" }>;
	readonly step?: string | undefined;
	readonly comparison?: string | undefined;
}): React.JSX.Element {
	const [recordOpen, setRecordOpen] = useState(false);
	const id = recordId(identity);
	const repResult = useQuery({
		...confirmationRepQuery(
			identity.kind === "confirmation" ? identity.groupId : "",
			identity.kind === "confirmation" ? identity.repId : "",
		),
		enabled: identity.kind === "confirmation",
	});
	const hasSessionAssessment = useHasSessionAssessment(
		identity,
		repResult.data?.mode,
	);
	const parsedNonSession =
		identity.kind === "confirmation" &&
		repResult.data !== undefined &&
		repResult.data.mode !== "session";
	const raw = useQuery({
		...savedRecordQuery(id),
		enabled:
			recordOpen &&
			(identity.kind !== "confirmation" || repResult.data?.mode === "session"),
	});
	return (
		<div className="flex flex-col gap-4 page-gutter py-5">
			{identity.kind === "standalone" ? (
				<StandalonePanel
					identity={identity}
					assessmentAvailable={hasSessionAssessment}
				/>
			) : null}
			{identity.kind === "replay" ? <ReplayPanel identity={identity} /> : null}
			{identity.kind === "confirmation" ? (
				<ConfirmationResults
					record={repResult.data}
					loading={repResult.isLoading}
					error={repResult.isError}
					sessionAssessmentAvailable={hasSessionAssessment}
				/>
			) : null}
			<ResultsEvidence
				identity={identity}
				record={repResult.data}
				step={step}
				comparison={comparison}
			/>
			<SavedRecord
				id={
					parsedNonSession && identity.kind === "confirmation"
						? `${identity.groupId}/${identity.repId} · server-parsed result`
						: id
				}
				label={
					parsedNonSession ? "parsed saved result JSON" : "saved record JSON"
				}
				open={recordOpen}
				onToggle={() => {
					setRecordOpen((current) => !current);
				}}
				raw={parsedNonSession ? JSON.stringify(repResult.data) : raw.data}
				loading={parsedNonSession ? repResult.isLoading : raw.isLoading}
				error={parsedNonSession ? repResult.isError : raw.isError}
			/>
		</div>
	);
}

function ConfirmationContext({
	identity,
}: {
	readonly identity: Extract<SessionHistoryIdentity, { kind: "confirmation" }>;
}): React.JSX.Element {
	const result = useQuery(
		confirmationRepQuery(identity.groupId, identity.repId),
	);
	if (result.isLoading) {
		return (
			<p className="page-gutter py-4 text-12 text-dim">Reading rep mode…</p>
		);
	}
	if (result.isError || result.data === undefined) {
		return (
			<p role="alert" className="page-gutter py-4 text-12 text-dim">
				Saved rep context unavailable because its result could not be read.
			</p>
		);
	}
	return result.data.mode === "session" ? (
		<SessionHistoryPage identity={identity} embedded />
	) : (
		<p className="page-gutter py-4 text-12 text-dim">
			A {result.data.mode} rep has no saved session context view. Its stage and
			final outcomes are on Results.
		</p>
	);
}

function AttemptContext({
	identity,
}: {
	readonly identity: Exclude<SessionHistoryIdentity, { kind: "stage" }>;
}): React.JSX.Element {
	return identity.kind === "confirmation" ? (
		<ConfirmationContext identity={identity} />
	) : (
		<SessionHistoryPage identity={identity} embedded />
	);
}

function attemptTitle(identity: SessionHistoryIdentity): string {
	switch (identity.kind) {
		case "standalone": {
			return "Session attempt";
		}
		case "confirmation": {
			return "Confirmation attempt";
		}
		case "replay": {
			return "Replay attempt";
		}
		case "stage": {
			return "Pipeline step";
		}
		default: {
			return identity satisfies never;
		}
	}
}

interface SiblingAttempt {
	readonly path: string;
	readonly label: string;
	readonly caseId?: string | undefined;
}
function attemptSiblings(
	identity: SessionHistoryIdentity,
	groupRecord: GroupAttemptIndex | undefined,
	rows: RunHistoryResponse["rows"] | undefined,
): readonly SiblingAttempt[] {
	return identity.kind === "confirmation"
		? (groupRecord?.repRecords
				.toSorted((left, right) => left.ordinal - right.ordinal)
				.map((rep) => ({
					path: attemptPath({
						kind: "confirmation",
						groupId: identity.groupId,
						repId: rep.repId,
					}),
					label: `Repetition ${String(rep.ordinal)}`,
					caseId: groupRecord.caseId,
				})) ?? [])
		: (rows
				?.flatMap((row) => {
					if (
						identity.kind === "standalone" &&
						row.kind === "session-attempt" &&
						row.caseId === identity.caseId
					) {
						return [
							{
								path: attemptPath({
									kind: "standalone",
									caseId: row.caseId,
									uuid: row.uuid,
								}),
								label: row.shortId ?? "Session attempt",
								caseId: row.caseId,
							},
						];
					}
					if (
						identity.kind === "replay" &&
						row.kind === "replay" &&
						row.lineage === identity.lineage
					) {
						return [
							{
								path: attemptPath({
									kind: "replay",
									lineage: row.lineage,
									timestamp: row.timestamp,
								}),
								label: row.shortId ?? "Replay",
								...(row.caseId !== undefined && { caseId: row.caseId }),
							},
						];
					}
					return [];
				})
				.toReversed() ?? []);
}

function attemptScope(identity: SessionHistoryIdentity): string {
	switch (identity.kind) {
		case "confirmation": {
			return "Within this group";
		}
		case "standalone": {
			return "Within this case";
		}
		case "replay": {
			return "Within this saved input";
		}
		case "stage": {
			return "Within this workflow";
		}
		default: {
			return identity satisfies never;
		}
	}
}
function AttemptNavigation({
	identity,
	view,
	step,
	comparison,
}: {
	readonly identity: SessionHistoryIdentity;
	readonly view: "results" | "context";
	readonly step?: string | undefined;
	readonly comparison?: string | undefined;
}): React.JSX.Element {
	const history = useQuery(runHistoryQuery);
	const group = useQuery({
		...groupAttemptsQuery(
			identity.kind === "confirmation" ? identity.groupId : "",
		),
		enabled: identity.kind === "confirmation",
	});
	const groupRecord = group.data;
	const siblings = attemptSiblings(identity, groupRecord, history.data?.rows);
	const position = siblings.findIndex(
		(item) => item.path === attemptPath(identity),
	);
	const selected = siblings[position];
	const previous = position > 0 ? siblings[position - 1] : undefined;
	const next = position === -1 ? undefined : siblings[position + 1];
	const caseId =
		selected?.caseId ??
		(identity.kind === "standalone" ? identity.caseId : groupRecord?.caseId);
	const search = {
		view,
		...(step !== undefined && { step }),
		...(comparison !== undefined && { comparison }),
	};
	return (
		<div className="flex flex-wrap items-center justify-between gap-3 border-b border-divider page-gutter py-3 text-14">
			<nav
				aria-label="Attempt breadcrumb"
				className="flex flex-wrap items-center gap-3"
			>
				{caseId === undefined ? null : (
					<Link
						to="/cases"
						search={{ caseId }}
						className="rounded-md border border-transparent px-3 py-2 text-link underline current:border-primary current:bg-selected current:text-pale current:no-underline"
					>
						{caseId}
					</Link>
				)}
				{identity.kind === "confirmation" ? (
					<Link
						to="/groups/$groupId"
						params={{ groupId: identity.groupId }}
						search={{
							view: "attempts",
							...(step !== undefined && { step }),
							...(comparison !== undefined && { comparison }),
						}}
						className="rounded-md border border-transparent px-3 py-2 text-link underline current:border-primary current:bg-selected current:text-pale current:no-underline"
					>
						Group results
					</Link>
				) : null}
				{comparison === undefined ? null : (
					<Link
						to="/comparisons/$digest"
						params={{ digest: comparison }}
						className="rounded-md border border-transparent px-3 py-2 text-link underline current:border-primary current:bg-selected current:text-pale current:no-underline"
					>
						Back to comparison
					</Link>
				)}
				<span>
					{position === -1
						? "Attempt position unavailable"
						: `Attempt ${String(position + 1)} of ${String(siblings.length)}`}
					{step === undefined ? "" : ` · ${step}`}
				</span>
				<span className="text-12 text-dim">{attemptScope(identity)}</span>
			</nav>
			<nav aria-label="Adjacent attempts" className="flex gap-2">
				{previous === undefined ? (
					<Button size="sm" variant="quiet" disabled>
						Previous attempt
					</Button>
				) : (
					<Button size="sm" variant="quiet" asChild>
						<Link to={previous.path} search={search}>
							Previous attempt
						</Link>
					</Button>
				)}
				{next === undefined ? (
					<Button size="sm" variant="quiet" disabled>
						Next attempt
					</Button>
				) : (
					<Button size="sm" variant="quiet" asChild>
						<Link to={next.path} search={search}>
							Next attempt
						</Link>
					</Button>
				)}
			</nav>
		</div>
	);
}

function confirmationTitle(
	identity: Extract<SessionHistoryIdentity, { kind: "confirmation" }>,
	rows: RunHistoryResponse["rows"] | undefined,
	group: GroupAttemptIndex | undefined,
): string {
	const groupRow = rows?.find(
		(row) => row.kind === "group" && row.groupId === identity.groupId,
	);
	const rep = group?.repRecords.find((row) => row.repId === identity.repId);
	const caseId = group?.caseId ?? groupRow?.caseId;

	return `${withinCase(groupRow?.shortId ?? "Group", caseId)} · ${caseId ?? "case unavailable"} · attempt ${rep === undefined ? "ordinal unavailable" : String(rep.ordinal)}`;
}

function useAttemptTitle(identity: SessionHistoryIdentity): string {
	const history = useQuery(runHistoryQuery);
	const group = useQuery({
		...groupAttemptsQuery(
			identity.kind === "confirmation" ? identity.groupId : "",
		),
		enabled: identity.kind === "confirmation",
	});
	const id = identity.kind === "stage" ? undefined : recordId(identity);
	const selectedRow = history.data?.rows.find((row) => row.recordId === id);

	switch (identity.kind) {
		case "standalone": {
			return `${withinCase(selectedRow?.shortId ?? "Session", identity.caseId)} · ${identity.caseId}`;
		}
		case "replay": {
			return selectedRow?.kind === "replay"
				? `${withinCase(selectedRow.shortId ?? "Replay", selectedRow.caseId)} · ${selectedRow.caseId ?? "case unavailable"} · ${selectedRow.stage} · replay`
				: "Replay · saved attempt";
		}
		case "confirmation": {
			return confirmationTitle(identity, history.data?.rows, group.data);
		}
		case "stage": {
			return attemptTitle(identity);
		}
		default: {
			return identity satisfies never;
		}
	}
}

export function AttemptWorkspacePage({
	identity,
	view = "results",
	step,
	comparison,
}: {
	readonly identity: SessionHistoryIdentity;
	readonly view?: "results" | "context";
	readonly step?: string | undefined;
	readonly comparison?: string | undefined;
}): React.JSX.Element {
	const path = attemptPath(identity);
	const runsSearch = useRunsReturnSearch();
	const id = identity.kind === "stage" ? undefined : recordId(identity);
	const title = useAttemptTitle(identity);

	return (
		<div className="flex min-h-full flex-col">
			<ScreenHeader
				title={title}
				eyebrow="Saved attempt"
				lead={
					<Link
						to="/"
						search={runsSearch}
						className="text-14 text-link hover:text-link-hover"
					>
						← Back to Runs
					</Link>
				}
				subline={
					identity.kind === "stage"
						? "This step opens in its pipeline workspace."
						: "Recorded output and assessment"
				}
				aside={
					id === undefined ? undefined : (
						<details>
							<summary className="cursor-pointer text-14">
								{identity.kind === "confirmation"
									? "Saved repetition ID"
									: "Canonical record ID"}
							</summary>
							<code className="mt-2 block select-all text-12 wrap-anywhere">
								{identity.kind === "confirmation"
									? `${identity.groupId}/${identity.repId}`
									: id}
							</code>
						</details>
					)
				}
			/>
			<AttemptNavigation
				identity={identity}
				view={view}
				{...(step !== undefined && { step })}
				{...(comparison !== undefined && { comparison })}
			/>
			{identity.kind === "stage" ? (
				<p className="p-6 text-12 text-dim">
					Open the{" "}
					<Link to={path} className="text-link hover:underline">
						pipeline step
					</Link>{" "}
					for its results.
				</p>
			) : (
				<>
					<nav
						aria-label="Attempt views"
						className="flex flex-wrap gap-2 border-b border-divider page-gutter py-3 text-14"
					>
						<CurrentLink
							to={path}
							search={{
								view: "results",
								...(step !== undefined && { step }),
								...(comparison !== undefined && { comparison }),
							}}
							marksCurrent={view === "results"}
							className="rounded-md border border-transparent px-3 py-2 text-link hover:underline current:border-primary current:bg-selected current:text-pale current:no-underline"
						>
							Results
						</CurrentLink>
						<CurrentLink
							to={path}
							search={{
								view: "context",
								...(step !== undefined && { step }),
								...(comparison !== undefined && { comparison }),
							}}
							marksCurrent={view === "context"}
							className="rounded-md border border-transparent px-3 py-2 text-link hover:underline current:border-primary current:bg-selected current:text-pale current:no-underline"
						>
							Context &amp; cost
						</CurrentLink>
					</nav>
					{view === "context" ? (
						<AttemptContext identity={identity} />
					) : (
						<ResultsContent
							key={path}
							identity={identity}
							{...(step !== undefined && { step })}
							{...(comparison !== undefined && { comparison })}
						/>
					)}
				</>
			)}
		</div>
	);
}
