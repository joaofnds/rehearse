import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
import { SectionLabel } from "#client/system/components/section-label";
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

function Measure({
	label,
	value,
}: {
	readonly label: string;
	readonly value: string;
}): React.JSX.Element {
	return (
		<div className="flex min-w-32 flex-col gap-1">
			<dt>
				<SectionLabel>{label}</SectionLabel>
			</dt>
			<dd className="font-mono text-12">{value}</dd>
		</div>
	);
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
}: {
	readonly row: SessionRow;
}): React.JSX.Element {
	return (
		<section className="rounded-lg border border-divider bg-card p-4">
			<h2 className="text-14 font-medium">Saved session result</h2>
			<p className="mt-2 font-mono text-12">{row.status}</p>
			<dl className="mt-4 flex flex-wrap gap-6">
				<Measure
					label="Checks"
					value={
						row.checks.state === "available"
							? `${String(row.checks.passed)} of ${String(row.checks.declared)} checks passed`
							: `Unavailable: ${row.checks.reasons.join("; ")}`
					}
				/>
				<Measure label="Cost" value={costReading(row.cost)} />
				<Measure label="Wall time" value={timeReading(row.wallTime)} />
				<Measure
					label="Corpus"
					value={corpusMeasurementReading(row.corpusVersion)}
				/>
				<Measure label="Started" value={row.startedAt ?? "Not recorded"} />
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
			<h2 className="text-14 font-medium">Saved replay result</h2>
			<p className="mt-2 font-mono text-12">
				{row.stage} · Grade {row.grade} · {row.status}
			</p>
			<p className="mt-1 text-12 text-dim">{row.finalOutcome.reason}</p>
			<dl className="mt-4 flex flex-wrap gap-6">
				<Measure label="Cost" value={costReading(row.cost)} />
				<Measure label="Wall time" value={timeReading(row.wallTime)} />
				<Measure
					label="Corpus"
					value={corpusMeasurementReading(row.corpusVersion)}
				/>
				<Measure label="Lineage" value={row.lineage} />
				<Measure label="Recorded at" value={row.timestamp} />
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
	return stage.verdict === "CONTINUE" ? "Checks passed" : "Checks failed";
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
}: {
	readonly record: Immutable<ConfirmationRepResult> | undefined;
	readonly loading: boolean;
	readonly error: boolean;
}): React.JSX.Element {
	const recordedCost =
		rep === undefined || rep.metrics.calls.length === 0
			? undefined
			: rep.metrics.calls.reduce(
					(total, call) => total + call.metrics.costUsd,
					0,
				);
	return (
		<section className="rounded-lg border border-divider bg-card p-4">
			<h2 className="text-14 font-medium">Saved rep result</h2>
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
					<p className="mt-2 font-mono text-12">{rep.outcome}</p>
					<dl className="mt-4 flex flex-wrap gap-6">
						<Measure label="Mode" value={rep.mode} />
						{rep.stages.map((stage) => (
							<Measure
								key={stage.stage}
								label={stage.stage}
								value={
									rep.mode === "session"
										? sessionCheckReading(stage)
										: stageReading(stage)
								}
							/>
						))}
						<Measure
							label="Cost"
							value={
								recordedCost === undefined
									? "Unavailable: no call metrics recorded"
									: `${spendReading(recordedCost)}${rep.metrics.status === "MISSING" ? ` recorded; incomplete: ${rep.metrics.missing.join("; ")}` : ""}`
							}
						/>
						<Measure label="Wall time" value={clockReading(rep.elapsedMs)} />
						<Measure label="Case" value={rep.caseId} />
						{rep.mode === "pipeline" ? (
							<Measure
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
		return <p className="text-13 text-dim">No step outcome was saved.</p>;
	}
	if (selected.status === "JUDGED") {
		return (
			<AttemptEvidence
				id={`rep:stage:${identity.groupId}/${identity.repId}/${selected.stage}`}
			/>
		);
	}
	return (
		<p className="text-13 text-dim">
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
			<nav aria-label="Rep steps" className="flex flex-wrap gap-3 text-13">
				{record.stages.map((item) => (
					<Link
						key={item.stage}
						to={attemptPath(identity)}
						search={{
							view: "results",
							step: item.stage,
							...(comparison !== undefined && { comparison }),
						}}
						aria-current={selected?.stage === item.stage ? "page" : undefined}
						className="text-accent-foreground underline"
					>
						{item.stage}
					</Link>
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
				className="text-12 text-accent-foreground hover:underline"
			>
				{open ? `Hide ${label}` : `Show ${label}`}
			</button>
			{open ? (
				<>
					<p className="mt-2 font-mono text-11-5 text-dim">{id}</p>
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
							className="mt-3 max-h-96 overflow-auto rounded border border-subtle bg-muted p-3 font-mono text-11-5 whitespace-pre-wrap break-all"
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
}: {
	readonly identity: Extract<SessionHistoryIdentity, { kind: "standalone" }>;
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
		<SessionResults row={row} />
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
		<div className="flex flex-col gap-4 px-6 py-5">
			{identity.kind === "standalone" ? (
				<StandalonePanel identity={identity} />
			) : null}
			{identity.kind === "replay" ? <ReplayPanel identity={identity} /> : null}
			{identity.kind === "confirmation" ? (
				<ConfirmationResults
					record={repResult.data}
					loading={repResult.isLoading}
					error={repResult.isError}
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
		return <p className="px-6 py-4 text-12 text-dim">Reading rep mode…</p>;
	}
	if (result.isError || result.data === undefined) {
		return (
			<p role="alert" className="px-6 py-4 text-12 text-dim">
				Saved rep context unavailable because its result could not be read.
			</p>
		);
	}
	return result.data.mode === "session" ? (
		<SessionHistoryPage identity={identity} embedded />
	) : (
		<p className="px-6 py-4 text-12 text-dim">
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
		<div className="flex flex-wrap items-center justify-between gap-3 border-b border-divider px-6 py-3 text-13">
			<nav
				aria-label="Attempt breadcrumb"
				className="flex flex-wrap items-center gap-3"
			>
				{caseId === undefined ? null : (
					<Link
						to="/cases"
						search={{ caseId }}
						className="text-accent-foreground underline"
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
						className="text-accent-foreground underline"
					>
						Group results
					</Link>
				) : null}
				{comparison === undefined ? null : (
					<Link
						to="/comparisons/$digest"
						params={{ digest: comparison }}
						className="text-accent-foreground underline"
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
	return (
		<div className="flex min-h-full flex-col">
			<ScreenHeader
				title={attemptTitle(identity)}
				eyebrow="Saved attempt"
				lead={
					<Link
						to="/"
						search={runsSearch}
						className="text-12 text-muted-foreground hover:text-foreground"
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
							<summary className="cursor-pointer text-12">
								{identity.kind === "confirmation"
									? "Saved repetition ID"
									: "Canonical record ID"}
							</summary>
							<code className="mt-2 block select-all text-12">
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
					<Link to={path} className="text-accent-foreground hover:underline">
						pipeline step
					</Link>{" "}
					for its results.
				</p>
			) : (
				<>
					<nav
						aria-label="Attempt views"
						className="flex gap-4 border-b border-divider px-6 py-3 text-12"
					>
						<Link
							to={path}
							search={{
								view: "results",
								...(step !== undefined && { step }),
								...(comparison !== undefined && { comparison }),
							}}
							aria-current={view === "results" ? "page" : undefined}
							className="text-accent-foreground hover:underline"
						>
							Results
						</Link>
						<Link
							to={path}
							search={{
								view: "context",
								...(step !== undefined && { step }),
								...(comparison !== undefined && { comparison }),
							}}
							aria-current={view === "context" ? "page" : undefined}
							className="text-accent-foreground hover:underline"
						>
							Context &amp; cost
						</Link>
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
