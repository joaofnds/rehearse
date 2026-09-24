/**
 * The figures a pipeline run row carries, each reported unavailable, for a
 * test whose subject is another column: it spreads these into a row it
 * builds by hand so the row matches the served shape without spelling out
 * figures the test does not read.
 */
export const UNREAD_RUN_FIGURES = {
	stepGrades: { state: "unavailable", reasons: ["not read by this test"] },
	taskGrade: { state: "unavailable", reasons: ["not read by this test"] },
	cost: { state: "unavailable", reasons: ["not read by this test"] },
	wallTime: { state: "unavailable", reasons: ["not read by this test"] },
} as const;

/** A replay row's figures, for a test whose subject is another column. */
export const UNREAD_REPLAY_FIGURES = {
	cost: { state: "unavailable", reasons: ["not read by this test"] },
	taskGrade: {
		state: "available",
		status: "NOT_APPLICABLE",
		reason: "not read by this test",
	},
	wallTime: { state: "unavailable", reasons: ["not read by this test"] },
} as const;
