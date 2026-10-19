import { describe, expect, it } from "bun:test";

import type { SessionAttempt } from "#benchmark/session-attempt";
import {
	buildSessionAttemptRecord,
	parseSessionAttemptRecord,
	sessionAttemptRecordSchema,
} from "#benchmark/session-record";

import {
	smokeAttempt,
	startedAttemptInputs,
	stateAttemptInputs,
	subagentAttemptInputs,
} from "./session-record-test-fixtures";

const ANALYSIS_EXAMPLES_33 = [
	{ attempt: smokeAttempt(), outcome: "a checked attempt" },
	{
		attempt: {
			...smokeAttempt(),
			checks: [],
			outcome: "EXECUTION_FAILED",
			reply: undefined,
		} satisfies SessionAttempt,
		outcome: "an attempt whose provider command failed",
	},
];
function recordsTheNamedResultsBesideAnEmptyChecksArrayForANoReplyAttempt(): void {
	const graded = buildSessionAttemptRecord(
		stateAttemptInputs({
			stateResults: [{ detail: "clean", name: "tree-clean", status: "PASS" }],
		}),
	);

	expect(graded).toMatchObject({
		checks: [],
		outcome: "NO_REPLY",
		stateResults: [{ detail: "clean", name: "tree-clean", status: "PASS" }],
	});
	expect(parseSessionAttemptRecord(JSON.stringify(graded))).toEqual(graded);
}

function recordsAGradingErrorRatherThanAStateResultWhenTheScorerCouldNotGrade(): void {
	const graded = buildSessionAttemptRecord(
		stateAttemptInputs({
			stateGradingError: "scorer sh score.sh exited 4: broken",
		}),
	);

	expect(graded).toMatchObject({
		stateGradingError: "scorer sh score.sh exited 4: broken",
	});
	expect(graded).not.toHaveProperty("stateResults");
}

function refusesARecordCarryingBothGradedResultsAndTheReasonItCouldNotGrade(): void {
	const graded = buildSessionAttemptRecord(
		stateAttemptInputs({
			stateResults: [{ detail: "clean", name: "tree-clean", status: "PASS" }],
		}),
	);

	const both = {
		...graded,
		stateGradingError: "scorer sh score.sh exited 4: broken",
	};

	expect(sessionAttemptRecordSchema.safeParse(both).success).toBe(false);
}

function reopensTheAgentsWhoseTranscriptTheProviderDidNotLeave(): void {
	const saved = buildSessionAttemptRecord(
		subagentAttemptInputs({ unavailableSubagents: ["a4", "a5"] }),
	);

	const reopened = parseSessionAttemptRecord(JSON.stringify(saved));

	expect(reopened).toMatchObject({
		schemaVersion: 3,
		unavailableSubagents: ["a4", "a5"],
	});
}

function reopensAnAttemptThatFoundEveryNamedAgentSTranscriptAsAnEmptyList(): void {
	const saved = buildSessionAttemptRecord(
		subagentAttemptInputs({ unavailableSubagents: [] }),
	);

	const reopened = parseSessionAttemptRecord(JSON.stringify(saved));

	expect(reopened).toMatchObject({
		schemaVersion: 3,
		unavailableSubagents: [],
	});
}

function reopensThemOnAnAttemptWhoseProviderCommandFailed(): void {
	const saved = buildSessionAttemptRecord(
		subagentAttemptInputs(
			{
				checks: [],
				contextManifest: undefined,
				outcome: "EXECUTION_FAILED",
				reply: undefined,
				unavailableSubagents: ["a4"],
			},
			"claude exited 1",
		),
	);

	const reopened = parseSessionAttemptRecord(JSON.stringify(saved));

	expect(reopened).toMatchObject({
		schemaVersion: 2,
		unavailableSubagents: ["a4"],
	});
}
describe("the start time a session attempt record carries", () => {
	it.each(ANALYSIS_EXAMPLES_33)(
		"reopens the instant $outcome started",
		({ attempt }) => {
			const saved = buildSessionAttemptRecord(startedAttemptInputs(attempt));

			const reopened = parseSessionAttemptRecord(JSON.stringify(saved));

			expect(reopened).toMatchObject({ startedAt: "2026-10-08T10:15:00.000Z" });
		},
	);
});
describe("the state grades a session attempt record carries", () => {
	it(
		"records the named results beside an empty checks array for a no-reply attempt",
		recordsTheNamedResultsBesideAnEmptyChecksArrayForANoReplyAttempt,
	);
	it(
		"records a grading error rather than a state result when the scorer could not grade",
		recordsAGradingErrorRatherThanAStateResultWhenTheScorerCouldNotGrade,
	);
	it(
		"refuses a record carrying both graded results and the reason it could not grade",
		refusesARecordCarryingBothGradedResultsAndTheReasonItCouldNotGrade,
	);
});
describe("the sub-agent evidence a session attempt record carries", () => {
	it(
		"reopens the agents whose transcript the provider did not leave",
		reopensTheAgentsWhoseTranscriptTheProviderDidNotLeave,
	);
	it(
		"reopens an attempt that found every named agent's transcript as an empty list",
		reopensAnAttemptThatFoundEveryNamedAgentSTranscriptAsAnEmptyList,
	);
	it(
		"reopens them on an attempt whose provider command failed",
		reopensThemOnAnAttemptWhoseProviderCommandFailed,
	);
});
