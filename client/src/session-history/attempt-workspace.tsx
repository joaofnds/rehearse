import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useState } from "react";
import { corpusMeasurementReading } from "#benchmark/corpus-version-label";
import type { Immutable } from "#benchmark/contracts";
import type { SessionHistoryReport } from "#benchmark/session-history";
import { apiClient } from "#client/api-client";
import { clockReading, spendReading } from "#client/run-history/run-progress";
import { runHistoryQuery } from "#client/run-history/run-history-query";
import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import { ScreenHeader } from "#client/system/components/screen-header";
import { SectionLabel } from "#client/system/components/section-label";
import { SessionHistoryPage } from "./session-history-page";
import type { SessionHistoryIdentity } from "./session-history-page";

type SessionRow = Extract<
	RunHistoryResponse["rows"][number],
	{ kind: "session-attempt" }
>;
type ReplayRow = Extract<
	RunHistoryResponse["rows"][number],
	{ kind: "replay" }
>;
type ConfirmationRepResult = InferResponseType<
	(typeof apiClient.api.groups)[":groupId"]["reps"][":repId"]["attempt"]["result"]["$get"],
	200
>;
interface ConfirmationRepQuery {
	readonly queryKey: readonly ["confirmation-rep-result", string, string];
	readonly queryFn: () => Promise<ConfirmationRepResult>;
}

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

function recordId(identity: SessionHistoryIdentity): string | undefined {
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
		case "stage": {
			return undefined;
		}
		default: {
			return identity satisfies never;
		}
	}
}

async function readRawRecord(id: string): Promise<string> {
	const response = await fetch(`/api/records/${encodeURIComponent(id)}`);
	if (!response.ok) {
		throw new Error(`Saved record unavailable (${String(response.status)})`);
	}
	return response.text();
}

async function readConfirmationRepResult(
	groupId: string,
	repId: string,
): Promise<ConfirmationRepResult> {
	const response = await apiClient.api.groups[":groupId"].reps[
		":repId"
	].attempt.result.$get({
		param: {
			groupId: encodeURIComponent(groupId),
			repId: encodeURIComponent(repId),
		},
	});
	if (!response.ok) {
		throw new Error(
			`Individual rep result unavailable (${String(response.status)})`,
		);
	}
	return response.json();
}

function confirmationRepQuery(
	groupId: string,
	repId: string,
): ConfirmationRepQuery {
	return {
		queryKey: ["confirmation-rep-result", groupId, repId],
		queryFn: () => readConfirmationRepResult(groupId, repId),
	} as const;
}

async function readReplayHistory(
	lineage: string,
	timestamp: string,
): Promise<SessionHistoryReport> {
	const response = await apiClient.api.replays[":lineage"][
		":timestamp"
	].history.$get({
		param: {
			lineage: encodeURIComponent(lineage),
			timestamp: encodeURIComponent(timestamp),
		},
	});
	if (!response.ok) {
		throw new Error("Could not read replay source history");
	}
	return response.json();
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
	const path = `/api/replays/${encodeURIComponent(lineage)}/${encodeURIComponent(timestamp)}/history`;
	const source = useQuery({
		queryKey: ["session-history", path],
		queryFn: () => readReplayHistory(lineage, timestamp),
	});
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
				<Link
					className="mt-3 inline-block text-12 text-accent-foreground hover:underline"
					to="/runs/$run"
					params={{ run: sourceRun }}
					search={{ view: "results", step: row.stage }}
				>
					Source step
				</Link>
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
	record,
	loading,
	error,
	groupId,
	repId,
}: {
	readonly record: Immutable<ConfirmationRepResult> | undefined;
	readonly loading: boolean;
	readonly error: boolean;
	readonly groupId: string;
	readonly repId: string;
}): React.JSX.Element {
	const rep =
		record?.groupId === groupId && record.repId === repId ? record : undefined;
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
			{error || (record !== undefined && rep === undefined) ? (
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
								value={stageReading(stage)}
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
						<Measure
							label="Final workflow outcome"
							value={finalOutcomeReading(rep.finalOutcome)}
						/>
					</dl>
				</>
			)}
			<Link
				className="mt-3 inline-block text-12 text-accent-foreground hover:underline"
				to="/groups/$groupId"
				params={{ groupId }}
			>
				Group results
			</Link>
		</section>
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

function ResultsContent({
	identity,
}: {
	readonly identity: Exclude<SessionHistoryIdentity, { kind: "stage" }>;
}): React.JSX.Element {
	const [recordOpen, setRecordOpen] = useState(false);
	const id = recordId(identity) ?? "";
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
		queryKey: ["saved-record-json", id],
		queryFn: () => readRawRecord(id),
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
					groupId={identity.groupId}
					repId={identity.repId}
				/>
			) : null}
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

export function AttemptWorkspacePage({
	identity,
	view = "results",
}: {
	readonly identity: SessionHistoryIdentity;
	readonly view?: "results" | "context";
}): React.JSX.Element {
	const path = attemptPath(identity);
	const id = recordId(identity);
	const subline =
		identity.kind === "confirmation"
			? `${identity.groupId} / ${identity.repId}`
			: (id ?? "This step opens in its pipeline workspace.");
	return (
		<div className="flex min-h-full flex-col">
			<ScreenHeader
				title={attemptTitle(identity)}
				eyebrow="Saved attempt"
				lead={
					<Link
						to="/"
						className="text-12 text-muted-foreground hover:text-foreground"
					>
						← Back to Runs
					</Link>
				}
				subline={subline}
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
							search={{ view: "results" }}
							aria-current={view === "results" ? "page" : undefined}
							className="text-accent-foreground hover:underline"
						>
							Results
						</Link>
						<Link
							to={path}
							search={{ view: "context" }}
							aria-current={view === "context" ? "page" : undefined}
							className="text-accent-foreground hover:underline"
						>
							Context &amp; cost
						</Link>
					</nav>
					{view === "context" ? (
						<AttemptContext identity={identity} />
					) : (
						<ResultsContent identity={identity} />
					)}
				</>
			)}
		</div>
	);
}
