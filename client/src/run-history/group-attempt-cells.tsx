import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import type { Immutable } from "#benchmark/contracts";
import { corpusMeasurementReading } from "#benchmark/corpus-version-label";
import type { ConfirmationRepResult as RepResult } from "#client/session-history/confirmation-rep-query";
import { Button } from "#client/system/ui/button";

import { RepOutcomes, repCoverage } from "./group-attempt-outcomes";
import { SessionRepState } from "./group-session-results";
import type { GroupRow } from "./group-workspace-contract";
import {
	EMPTY_COLLECTION_LENGTH,
	NO_RECORDED_COST_USD,
	NO_SPEND_USD,
} from "./group-workspace-contract";
import { clockReading, spendReading } from "./run-progress";

interface AttemptRef {
	readonly repId: string;
	readonly ordinal?: number | undefined;
}

interface AttemptReading {
	readonly ref: AttemptRef;
	readonly result: Immutable<RepResult> | undefined;
	readonly loading: boolean;
}

interface AttemptCellsContext {
	readonly step?: string;
	readonly comparison?: string;
}

function attemptCells(
	row: GroupRow,
	reading: AttemptReading,
	search: AttemptCellsContext,
): readonly ReactNode[] {
	const { repId, ordinal } = reading.ref;
	const rep = reading.result;
	const total = rep?.metrics.calls.reduce(
		(sum, call) => sum + call.metrics.costUsd,
		NO_SPEND_USD,
	);
	const params = { groupId: row.groupId, repId };
	const contextPath = `/groups/${encodeURIComponent(row.groupId)}/reps/${encodeURIComponent(repId)}/attempt`;
	const contextLink = row.links.find(
		(link) => link.state === "available" && link.href === contextPath,
	);
	const contextAvailable = contextLink?.state === "available";

	return [
		<AttemptIdentity
			key="attempt"
			ordinal={ordinal}
			params={params}
			repId={repId}
			search={search}
		/>,
		<div key="outcomes" className="flex flex-col gap-2">
			<RepOutcomes rep={rep} loading={reading.loading} mode={row.mode} />
			{row.mode === "session" ? (
				<SessionRepState groupId={row.groupId} repId={repId} />
			) : null}
		</div>,
		<AttemptResources key="resources" rep={rep} total={total} />,
		<div key="coverage">
			{corpusMeasurementReading(row.corpusVersion)}
			<p className="mt-2 text-secondary-foreground">{repCoverage(rep)}</p>
		</div>,
		<AttemptEvidenceLink
			key="evidence"
			contextAvailable={contextAvailable}
			params={params}
			search={search}
			row={row}
		/>,
	];
}

interface AttemptIdentityProps {
	readonly ordinal: number | undefined;
	readonly params: { readonly groupId: string; readonly repId: string };
	readonly repId: string;
	readonly search: AttemptCellsContext;
}

function AttemptIdentity({
	ordinal,
	params,
	repId,
	search,
}: AttemptIdentityProps): React.JSX.Element {
	return (
		<div key="attempt" className="flex min-w-0 flex-col">
			<div className="flex flex-wrap items-center gap-x-2">
				<p className="font-medium">
					{ordinal === undefined
						? "Saved repetition"
						: `Repetition ${String(ordinal)}`}
				</p>
				<Button asChild variant="link" size="inline">
					<Link
						to="/groups/$groupId/reps/$repId/attempt"
						params={params}
						search={{ view: "results", ...search }}
					>
						Results
					</Link>
				</Button>
			</div>
			<details>
				<summary className="min-h-touch-target cursor-pointer content-center text-14 text-muted-foreground">
					Repetition ID
				</summary>
				<code className="block font-mono text-12 text-dim select-text wrap-anywhere">
					{repId}
				</code>
			</details>
		</div>
	);
}

interface AttemptResourcesProps {
	readonly rep: AttemptReading["result"];
	readonly total: number | undefined;
}

function AttemptResources({
	rep,
	total,
}: AttemptResourcesProps): React.JSX.Element {
	return (
		<div key="resources" className="font-mono">
			{rep === undefined || rep.metrics.calls.length === EMPTY_COLLECTION_LENGTH
				? "Cost unavailable"
				: `${spendReading(total ?? NO_RECORDED_COST_USD)}${rep.metrics.status === "MISSING" ? " recorded; incomplete" : ""}`}
			<p className="mt-2 text-secondary-foreground">
				{rep === undefined ? "Time unavailable" : clockReading(rep.elapsedMs)}
			</p>
		</div>
	);
}

interface AttemptEvidenceLinkProps {
	readonly contextAvailable: boolean;
	readonly params: { readonly groupId: string; readonly repId: string };
	readonly search: AttemptCellsContext;
	readonly row: GroupRow;
}

function AttemptEvidenceLink({
	contextAvailable,
	params,
	search,
	row,
}: AttemptEvidenceLinkProps): React.JSX.Element {
	return (
		<div key="evidence" className="flex flex-wrap items-center gap-2">
			{contextAvailable ? (
				<Button asChild variant="link" size="inline">
					<Link
						to="/groups/$groupId/reps/$repId/attempt"
						params={params}
						search={{ view: "context", ...search }}
					>
						Context & cost
					</Link>
				</Button>
			) : (
				<span className="text-muted-foreground">
					{row.mode === "session"
						? "Context unavailable"
						: "No session context"}
				</span>
			)}
		</div>
	);
}

export { attemptCells as default };
export type { AttemptCellsContext, AttemptReading, AttemptRef };
