import type { CalibrationResponse } from "#client/calibration/calibration-query";
import type { ComparisonIndexResponse } from "#client/comparison/comparison-index-query";
import type { CorpusResponse } from "#client/corpus/corpus-query";
import type { SettingsReading } from "#client/launch/settings-query";
import type { RunHistoryResponse } from "#client/run-history/run-history-query";

const savedCeilingUsd = 20;

const NO_RUNS: RunHistoryResponse = { launches: [], rows: [], unreadable: [] };

const EMPTY_CORPUS: CorpusResponse = {
	digest: "ffd58d",
	files: [],
	lastEdit: {
		kind: "not-recorded",
		reason:
			"the corpus under test has no earlier version in its log to compare against",
	},
	refusals: [],
	root: "/corpus",
};

const NO_GRADES: CalibrationResponse = {
	excludedUnknownJudgeReviews: 0,
	groups: [],
	next: null,
	reviews: 0,
	rows: [],
	ungraded: 0,
	withinOneStep: 0,
};

/** The settings as GET /api/settings answers them, with the ceiling given. */
function settingsReading(spendCeilingUsd: number | null): SettingsReading {
	return {
		linkCommand: "rehearse settings --link-corpus <DIR>",
		linkedCorpus: { kind: "live", root: "/home/operator/.claude" },
		liveCorpusRoot: "/home/operator/.claude",
		overrun: "The ceiling can be overrun by the calls in flight.",
		recordsDirectory: "/records",
		setCommand: "rehearse settings --spend-ceiling-usd <USD>",
		spendCeilingUsd,
	};
}

const NO_COMPARISONS: ComparisonIndexResponse = {
	comparisons: [],
	unreadable: [],
};

/**
 * The bodies the shell reads on every route, for its nav badges, its bar of
 * runs in flight, its corpus card and whether the install is fresh, and the
 * full run history the landing screen reads, each typed against its own
 * route's response. The settings hold a ceiling, so a route opens on its own
 * screen rather than setup.
 */
const SHELL_BASELINE: ReadonlyMap<string, unknown> = new Map<string, unknown>([
	["/api/confirmation-archives", { archived: [], unreadable: [] }],
	["/api/runs", NO_RUNS],
	["/api/run-listing", NO_RUNS],
	["/api/run-staleness", { records: {} }],
	["/api/corpus", EMPTY_CORPUS],
	["/api/corpus-summary", EMPTY_CORPUS],
	["/api/comparisons", NO_COMPARISONS],
	["/api/calibration", NO_GRADES],
	["/api/settings", settingsReading(savedCeilingUsd)],
]);

export { NO_GRADES, settingsReading, SHELL_BASELINE };
