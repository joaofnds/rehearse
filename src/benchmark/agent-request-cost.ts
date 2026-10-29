import type { Participant } from "./agent-cost-participants";
import { summed, tally } from "./agent-cost-tally";
import type { Tally } from "./agent-cost-tally";
import type { ContextRateCatalog } from "./context-evidence-contract";
import type { Immutable } from "./contracts";
import { sessionHistoryRequestCosts } from "./session-history";
import type {
	SessionHistoryRequestCost,
	SessionHistoryRequestEntry,
	SessionHistoryRequestSeries,
} from "./session-history";
import { unreadableAttemptLines } from "./session-history-request-pricing";
import type { RequestLocator, SkillWindow } from "./skill-cost-windows";
import { skillWindows, windowAt } from "./skill-cost-windows";
import type { TranscriptLine } from "./transcript";

const NO_TOKENS = 0;

/** Where each attempt request of one agent went, keyed by its first line. */
interface Allocation {
	readonly windowByRequest: ReadonlyMap<number, SkillWindow | undefined>;
	readonly windows: readonly SkillWindow[];
	readonly requestOf: RequestLocator;
	readonly costs: ReadonlyMap<number, SessionHistoryRequestCost>;
	readonly attemptEntries: readonly SessionHistoryRequestEntry[];
	/** Undefined among them for a request that names no model. */
	readonly models: ReadonlySet<string | undefined>;
	/** Each unreadable attempt line's reason, in the window it falls in. */
	readonly unreadable: readonly UnreadableLine[];
}

interface UnreadableLine {
	readonly reason: string;
	readonly window: SkillWindow | undefined;
}

/** The first line of the request a transcript row belongs to. */
function requestLocator(
	series: Immutable<SessionHistoryRequestSeries>,
	lines: Immutable<readonly TranscriptLine[]>,
): RequestLocator {
	const firstLineById = new Map<string, number>();
	for (const { requestId, line } of series.entries) {
		if (requestId !== undefined && !firstLineById.has(requestId)) {
			firstLineById.set(requestId, line);
		}
	}

	const requestIdByLine = new Map(
		lines.map(({ line, requestId }) => [line, requestId]),
	);

	return (line) => {
		const requestId = requestIdByLine.get(line);

		return requestId === undefined ? line : firstLineById.get(requestId);
	};
}

function allocate(
	participant: Immutable<Participant>,
	rates: ContextRateCatalog,
): Allocation {
	const requestOf = requestLocator(participant.series, participant.lines);
	const windows = skillWindows(participant, requestOf);
	const costs = sessionHistoryRequestCosts(participant.series, rates);
	const entries = attemptEntries(participant.series);
	const unreadable = unreadableAttemptLines(
		participant.series,
		participant.agent?.agentId,
	);

	return {
		attemptEntries: entries,
		costs,
		models: spentModels(entries),
		requestOf,
		unreadable: [...unreadable].map(([line, reason]) => ({
			reason,
			window: windowAt(windows, line),
		})),
		windowByRequest: new Map(
			[...costs.keys()].map((line) => [line, windowAt(windows, line)]),
		),
		windows,
	};
}

function linesWhere(
	allocation: Readonly<Allocation>,
	keep: (window: Immutable<SkillWindow> | undefined) => boolean,
): readonly number[] {
	return [...allocation.windowByRequest]
		.filter(([, window]) => keep(window))
		.map(([line]) => line);
}

/**
 * The models requests spent on, with undefined for a request that names none.
 * A request that carried no usage spent nothing, so the provider counts
 * nothing for its model, as for the rows it writes under the model name
 * "<synthetic>".
 */
function spentModels(
	entries: Immutable<readonly SessionHistoryRequestEntry[]>,
): ReadonlySet<string | undefined> {
	return new Set(
		entries
			.filter(
				(entry) =>
					entry.usageState !== "complete" ||
					entry.totalInputTokens + entry.usage.outputTokens > NO_TOKENS,
			)
			.map(({ model }) => model),
	);
}

function attemptEntries(
	series: Immutable<SessionHistoryRequestSeries>,
): readonly SessionHistoryRequestEntry[] {
	return series.entries.filter(({ region }) => region === "attempt");
}

function known(models: ReadonlySet<string | undefined>): ReadonlySet<string> {
	return new Set([...models].filter((model) => model !== undefined));
}

/** The requests of the windows kept, and the unreadable lines inside them. */
function tallyWhere(
	allocation: Readonly<Allocation>,
	keep: (window: Immutable<SkillWindow> | undefined) => boolean,
): Tally {
	return summed(
		[tally(linesWhere(allocation, keep), allocation.costs)],
		allocation.unreadable
			.filter(({ window }) => keep(window))
			.map(({ reason }) => reason),
	);
}

function ownTally(allocation: Readonly<Allocation>): Tally {
	return tallyWhere(allocation, () => true);
}
export {
	allocate,
	linesWhere,
	spentModels,
	attemptEntries,
	known,
	ownTally,
	tallyWhere,
};
export type { Allocation };
