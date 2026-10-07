import type { RowStaleness } from "#server/run-history";

/**
 * The figures a pipeline run row carries, each reported unavailable or empty, for a
 * test whose subject is another column: it spreads these into a row it
 * builds by hand so the row matches the served shape without spelling out
 * figures the test does not read.
 */
export const UNREAD_RUN_FIGURES = {
	stageGrades: { state: "unavailable", reasons: ["not read by this test"] },
	finalOutcome: { state: "unavailable", reasons: ["not read by this test"] },
	cost: { state: "unavailable", reasons: ["not read by this test"] },
	wallTime: { state: "unavailable", reasons: ["not read by this test"] },
	minimumGrade: { state: "unavailable", reasons: ["not read by this test"] },
	firedBlockers: { state: "unavailable", reasons: ["not read by this test"] },
	replayableStages: [],
} as const;

/** A replay row's figures, for a test whose subject is another column. */
export const UNREAD_REPLAY_FIGURES = {
	cost: { state: "unavailable", reasons: ["not read by this test"] },
	finalOutcome: {
		state: "available",
		status: "NOT_APPLICABLE",
		reason: "not read by this test",
	},
	wallTime: { state: "unavailable", reasons: ["not read by this test"] },
	pipelineStages: {
		state: "unavailable",
		reasons: ["not read by this test"],
	},
	firedBlockers: { state: "unavailable", reasons: ["not read by this test"] },
} as const;

/**
 * The cost and wall time a session attempt or group row carries, for a test
 * whose subject is another column.
 */
export const UNREAD_COST_AND_TIME = {
	cost: { state: "unavailable", reasons: ["not read by this test"] },
	wallTime: { state: "unavailable", reasons: ["not read by this test"] },
} as const;

/** A session attempt row's figures, for a test whose subject is another column. */
export const UNREAD_SESSION_ATTEMPT_FIGURES = {
	...UNREAD_COST_AND_TIME,
	checks: { state: "unavailable", reasons: ["not read by this test"] },
	startedAt: undefined,
} as const;

/** A confirmation group row's figures, for a test whose subject is another column. */
export const UNREAD_GROUP_FIGURES = {
	...UNREAD_COST_AND_TIME,
	stageSummaries: [],
	finalOutcomes: {},
	successful: 0,
	unreadReps: [],
	pipelineStages: {
		state: "unavailable",
		reasons: ["not read by this test"],
	},
	firedBlockers: { state: "unavailable", reasons: ["not read by this test"] },
	startedAt: undefined,
} as const;

/** A row's staleness, reported unavailable, for a test whose subject is another column. */
export const UNREAD_STALENESS = {
	state: "unavailable",
	reasons: ["not read by this test"],
} as const;

/**
 * A staleness judgment with no version to measure a distance from, the
 * reading a record written before corpus versions gets, for a test whose
 * subject is the stale or clear judgment rather than the distance.
 */
export function unversionedStaleness(judgment: {
	readonly stale: boolean;
	readonly causes: readonly string[];
}): RowStaleness {
	return {
		state: "available",
		...judgment,
		changedFiles: [],
		onlyCorpusFiles: false,
		distance: {
			kind: "not-recorded",
			reason: "recorded before corpus versions",
		},
		readManifest: [],
	};
}
