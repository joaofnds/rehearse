import type { LaunchRecord } from "#benchmark/launch-record";
import type { RunEventStore } from "#benchmark/run-events";
import type { RunLiveness } from "#benchmark/run-liveness";
import type { AttemptPosition } from "#server/checkpoint-attempts";
import type {
	ConfirmationGroupRow,
	RunHistoryRow,
	RunListingRow,
	UnreadableRecord,
} from "#server/run-history-contract";
import type liveLaunches from "#server/run-history-live-launches";

interface ListingEnvironment {
	readonly runsDirectory: string;
	readonly liveness: RunLiveness;
	readonly runEvents: RunEventStore;
	readonly only: ReadonlySet<string> | undefined;
}

interface ListingIndexes {
	readonly shortIds: ReadonlyMap<string, string>;
	readonly groupCheckpoints: ReadonlyMap<
		string,
		NonNullable<ConfirmationGroupRow["checkpoint"]>
	>;
	readonly attempts: ReadonlyMap<string, AttemptPosition>;
	readonly launchByPid: ReadonlyMap<number, LaunchRecord>;
	readonly live: Awaited<ReturnType<typeof liveLaunches>>;
	readonly unreadable: readonly UnreadableRecord[];
}

interface RowRead {
	readonly kind: RunHistoryRow["kind"];
	readonly id: string;
	readonly read: () => Promise<RunListingRow | undefined>;
}

interface ListingSelection<Named> {
	readonly kind: RunHistoryRow["kind"];
	readonly only: ReadonlySet<string> | undefined;
	readonly shortIds: ReadonlyMap<string, string>;
	readonly idOf: (name: Named) => string;
	readonly read: (
		name: Named,
		shortId: string | undefined,
	) => Promise<RunListingRow | undefined>;
}

function listingSelection<Named>(
	named: readonly Named[],
	selection: ListingSelection<Named>,
): readonly RowRead[] {
	return named
		.filter(
			(candidate) => selection.only?.has(selection.idOf(candidate)) ?? true,
		)
		.map((name) => ({
			id: selection.idOf(name),
			kind: selection.kind,
			read: async () =>
				await selection.read(
					name,
					selection.shortIds.get(selection.idOf(name)),
				),
		}));
}

export { listingSelection as default };

export type { ListingEnvironment, ListingIndexes, RowRead, ListingSelection };
