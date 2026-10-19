import { useQueries, useQuery } from "@tanstack/react-query";

import confirmationRepQuery from "#client/session-history/confirmation-rep-query";
import groupAttemptsQuery from "#client/session-history/group-attempts-query";
import TableShell from "#client/system/components/table-shell";

import type {
	AttemptCellsContext,
	AttemptReading,
	AttemptRef,
} from "./group-attempt-cells";
import attemptCells from "./group-attempt-cells";
import type { GroupRow } from "./group-workspace-contract";
import { EMPTY_COLLECTION_LENGTH } from "./group-workspace-contract";

interface AttemptsProps {
	readonly row: GroupRow;
	readonly step?: string | undefined;
	readonly comparison?: string | undefined;
}

function Attempts({ row, step, comparison }: AttemptsProps): React.JSX.Element {
	const group = useQuery(groupAttemptsQuery(row.groupId));
	let refs: readonly AttemptRef[] = row.repAttempts.map(({ repId }) => ({
		repId,
	}));
	if (group.data !== undefined) {
		refs = group.data.repRecords;
	}
	const results = useQueries({
		queries: refs.map(({ repId }) => confirmationRepQuery(row.groupId, repId)),
	});
	const search = {
		...(step !== undefined && { step }),
		...(comparison !== undefined && { comparison }),
	};

	const readings: readonly AttemptReading[] = refs.map((ref, index) => ({
		loading: results[index]?.isLoading ?? false,
		ref,
		result: results[index]?.data,
	}));
	return (
		<section className="flex min-w-0 flex-col gap-4">
			<p className="max-w-prose text-14 text-muted-foreground">
				Each repetition keeps its outcome, recorded cost and evidence together.
				Detailed output and checks depend on what that record retained.
			</p>
			<GroupAttemptTable row={row} readings={readings} search={search} />
			{refs.length === EMPTY_COLLECTION_LENGTH ? (
				<p className="text-14 text-muted-foreground">
					No rep results were recorded.
				</p>
			) : null}
			<AttemptRecordDiagnostics row={row} />
		</section>
	);
}

interface GroupAttemptTableProps {
	readonly row: GroupRow;
	readonly readings: readonly AttemptReading[];
	readonly search: AttemptCellsContext;
}

function GroupAttemptTable({
	row,
	readings,
	search,
}: GroupAttemptTableProps): React.JSX.Element {
	return (
		<TableShell
			caption="Group attempts"
			columns={[
				"Attempt",
				"Outcome & steps",
				"Cost & time",
				"Corpus & coverage",
				"Evidence",
			]}
			numeric={["Cost & time"]}
			className="min-w-320 table-fixed text-14"
			columnClasses={["w-56", "w-88", "w-48", "w-72", "w-56"]}
			rows={readings.map((reading) => attemptCells(row, reading, search))}
		/>
	);
}

interface AttemptRecordDiagnosticsProps {
	readonly row: GroupRow;
}

function AttemptRecordDiagnostics({
	row,
}: AttemptRecordDiagnosticsProps): React.JSX.Element {
	return (
		<>
			{row.links
				.filter((link) => link.state === "unavailable")
				.map((link) => (
					<p
						key={link.label}
						className="text-14 text-muted-foreground wrap-anywhere"
					>
						{link.label} · {link.reason}
					</p>
				))}
			{row.unreadReps.map((rep) => (
				<p
					key={rep.repId}
					className="text-14 text-muted-foreground wrap-anywhere"
				>
					{rep.repId}: {rep.reason}
				</p>
			))}
		</>
	);
}

export { Attempts as default };
