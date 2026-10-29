import type { Participant } from "./agent-cost-participants";
import { tally, unreadableLineReason } from "./agent-cost-tally";
import type { Tally } from "./agent-cost-tally";
import type { ContextRateCatalog } from "./context-evidence-contract";
import type { Immutable } from "./contracts";
import { sessionHistoryRequestCosts } from "./session-history";
import type {
	SessionHistoryRequestCost,
	SessionHistoryRequestEntry,
	SessionHistoryRequestSeries,
} from "./session-history";
import type { RequestLocator, SkillWindow } from "./skill-cost-windows";
import { skillWindows, windowAt } from "./skill-cost-windows";
import type { TranscriptLine } from "./transcript";

const NO_TOKENS = 0;

const NO_UNREADABLE_LINES = 0;

/** Where each attempt request of one agent went, keyed by its first line. */
interface Allocation {
	readonly windowByRequest: ReadonlyMap<number, SkillWindow | undefined>;
	readonly windows: readonly SkillWindow[];
	readonly requestOf: RequestLocator;
	readonly costs: ReadonlyMap<number, SessionHistoryRequestCost>;
	readonly attemptEntries: readonly SessionHistoryRequestEntry[];
	/** Undefined among them for a request that names no model. */
	readonly models: ReadonlySet<string | undefined>;
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

/**
 * An attempt line the series could not read may be a request on any model,
 * so it reads as one that no rate prices.
 */
function unreadableCosts(
	participant: Immutable<Participant>,
): readonly (readonly [number, SessionHistoryRequestCost])[] {
	const agentId = participant.agent?.agentId;

	return participant.series.unreadableLines
		.filter(({ region }) => region === "attempt")
		.map(({ line }) => [
			line,
			{ reason: unreadableLineReason(agentId, line), state: "unpriced" },
		]);
}

function allocate(
	participant: Immutable<Participant>,
	rates: ContextRateCatalog,
): Allocation {
	const requestOf = requestLocator(participant.series, participant.lines);
	const windows = skillWindows(participant, requestOf);
	const unreadable = unreadableCosts(participant);
	const costs = new Map(
		[
			...sessionHistoryRequestCosts(participant.series, rates),
			...unreadable,
		].toSorted(([line], [other]) => line - other),
	);
	const entries = attemptEntries(participant.series);
	const models = spentModels(entries);

	return {
		attemptEntries: entries,
		costs,
		models:
			unreadable.length === NO_UNREADABLE_LINES
				? models
				: new Set([...models, undefined]),
		requestOf,
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

function ownTally(allocation: Readonly<Allocation>): Tally {
	return tally([...allocation.windowByRequest.keys()], allocation.costs);
}
export { allocate, linesWhere, spentModels, attemptEntries, known, ownTally };
export type { Allocation };
