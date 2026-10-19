import type { RowStaleness } from "#server/run-history";

/**
 * The figures a pipeline run row carries, each reported unavailable or empty, for a
 * test whose subject is another column: it spreads these into a row it
 * builds by hand so the row matches the served shape without spelling out
 * figures the test does not read.
 */
const UNREAD_RUN_FIGURES = {
	cost: { reasons: ["not read by this test"], state: "unavailable" },
	finalOutcome: { reasons: ["not read by this test"], state: "unavailable" },
	firedBlockers: { reasons: ["not read by this test"], state: "unavailable" },
	minimumGrade: { reasons: ["not read by this test"], state: "unavailable" },
	replayableStages: [],
	stageGrades: { reasons: ["not read by this test"], state: "unavailable" },
	wallTime: { reasons: ["not read by this test"], state: "unavailable" },
} as const;

/** A replay row's figures, for a test whose subject is another column. */
const UNREAD_REPLAY_FIGURES = {
	cost: { reasons: ["not read by this test"], state: "unavailable" },
	finalOutcome: {
		reason: "not read by this test",
		state: "available",
		status: "NOT_APPLICABLE",
	},
	firedBlockers: { reasons: ["not read by this test"], state: "unavailable" },
	pipelineStages: {
		reasons: ["not read by this test"],
		state: "unavailable",
	},
	wallTime: { reasons: ["not read by this test"], state: "unavailable" },
} as const;

/**
 * The cost and wall time a session attempt or group row carries, for a test
 * whose subject is another column.
 */
const UNREAD_COST_AND_TIME = {
	cost: { reasons: ["not read by this test"], state: "unavailable" },
	wallTime: { reasons: ["not read by this test"], state: "unavailable" },
} as const;

/** A session attempt row's figures, for a test whose subject is another column. */
const UNREAD_SESSION_ATTEMPT_FIGURES = {
	...UNREAD_COST_AND_TIME,
	checks: { reasons: ["not read by this test"], state: "unavailable" },
	startedAt: undefined,
} as const;

/** A confirmation group row's figures, for a test whose subject is another column. */
const UNREAD_GROUP_FIGURES = {
	qualityFailures: 0,
	...UNREAD_COST_AND_TIME,
	finalOutcomes: {},
	firedBlockers: { reasons: ["not read by this test"], state: "unavailable" },
	pipelineStages: {
		reasons: ["not read by this test"],
		state: "unavailable",
	},
	stageSummaries: [],
	startedAt: undefined,
	successful: 0,
	unreadReps: [],
} as const;

/** A row's staleness, reported unavailable, for a test whose subject is another column. */
const UNREAD_STALENESS = {
	reasons: ["not read by this test"],
	state: "unavailable",
} as const;

/**
 * A staleness judgment with no version to measure a distance from, the
 * reading a record written before corpus versions gets, for a test whose
 * subject is the stale or clear judgment rather than the distance.
 */
interface UnversionedStalenessProps {
	readonly stale: boolean;
	readonly causes: readonly string[];
}

function unversionedStaleness(
	judgment: UnversionedStalenessProps,
): RowStaleness {
	return {
		state: "available",
		...judgment,
		changedFiles: [],
		distance: {
			kind: "not-recorded",
			reason: "recorded before corpus versions",
		},
		onlyCorpusFiles: false,
	};
}

export {
	UNREAD_COST_AND_TIME,
	UNREAD_GROUP_FIGURES,
	UNREAD_REPLAY_FIGURES,
	UNREAD_RUN_FIGURES,
	UNREAD_SESSION_ATTEMPT_FIGURES,
	UNREAD_STALENESS,
	unversionedStaleness,
};
