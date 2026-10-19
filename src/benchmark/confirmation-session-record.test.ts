import { describe, expect, it } from "bun:test";

import type { ConfirmationRepRecord } from "./confirmation-record";
import { parseConfirmationRepRecord } from "./confirmation-record";
import ConfirmationRepBuilder from "./confirmation-rep-test-builder";
import type { Immutable } from "./contracts";
import SessionConfirmationRepBuilder from "./session-confirmation-rep-test-builder";

const FIRST_RECORDED_STAGE_INDEX = 0;

const GIT_SHA_HEX_CHARACTERS = 40;
const parseConfirmationRepRecordAcceptsASessionRepAtSchemaVersion1WithItsChecksAsOneStage =
	(): void => {
		const base = new ConfirmationRepBuilder().build();
		const record: Immutable<ConfirmationRepRecord> = {
			...base,
			caseId: "smoke",
			finalOutcome: { status: "NOT_APPLICABLE" },
			mode: "session",
			stages: [
				{
					elapsedMs: 1600,
					evidence: {
						recordFile: "attempt.json",
						resultSha: "a".repeat(GIT_SHA_HEX_CHARACTERS),
					},
					grade: "A",
					stage: "checks",
					status: "JUDGED",
					verdict: "CONTINUE",
				},
			],
			worktreePath: "/tmp/rehearse-attempt-abc",
		};

		expect(parseConfirmationRepRecord(JSON.stringify(record))).toEqual(record);
	};
const parseConfirmationRepRecordRefusesASessionRepCalledSuccessfulWhenItsChecksFailed =
	(): void => {
		const base = new ConfirmationRepBuilder().build();
		const record = {
			...base,
			finalOutcome: { status: "NOT_APPLICABLE" },
			mode: "session",
			stages: [
				{
					elapsedMs: 1600,
					evidence: {
						recordFile: "attempt.json",
						resultSha: "a".repeat(GIT_SHA_HEX_CHARACTERS),
					},
					grade: "F",
					stage: "checks",
					status: "JUDGED",
					verdict: "STOP",
				},
			],
		};

		expect(() => parseConfirmationRepRecord(JSON.stringify(record))).toThrow(
			"Successful reps require passing stage and final outcomes",
		);
	};
const parseConfirmationRepRecordOmitsEphemeralV2SessionPathsAndRefusesWorktreeClaims =
	(): void => {
		const record = new SessionConfirmationRepBuilder().build();

		expect(parseConfirmationRepRecord(JSON.stringify(record))).toEqual(record);
		expect(() =>
			parseConfirmationRepRecord(
				JSON.stringify({ ...record, worktreePath: "/tmp/worktree" }),
			),
		).toThrow();
		expect(() =>
			parseConfirmationRepRecord(
				JSON.stringify({ ...record, attemptDirectory: "/tmp/attempt" }),
			),
		).toThrow();
	};
const parseConfirmationRepRecordRefusesAnUnsuccessfulV2SessionRepWithPassingCompleteEvidence =
	(): void => {
		const record = new SessionConfirmationRepBuilder().build();

		expect(() =>
			parseConfirmationRepRecord(
				JSON.stringify({ ...record, outcome: "UNSUCCESSFUL" }),
			),
		).toThrow("Passing checks with complete metrics require a successful rep");
	};
describe(parseConfirmationRepRecord.name, () => {
	describe("when reading session repetition records", () => {
		it(
			"accepts a session rep at schema version 1, with its checks as one stage",
			parseConfirmationRepRecordAcceptsASessionRepAtSchemaVersion1WithItsChecksAsOneStage,
		);
		it(
			"omits ephemeral v2 session paths and refuses worktree claims",
			parseConfirmationRepRecordOmitsEphemeralV2SessionPathsAndRefusesWorktreeClaims,
		);
		describe("when record evidence is invalid", () => {
			it(
				"refuses a session rep called successful when its checks failed",
				parseConfirmationRepRecordRefusesASessionRepCalledSuccessfulWhenItsChecksFailed,
			);
			it.each([
				{ grade: "A", verdict: "STOP" },
				{ grade: "F", verdict: "CONTINUE" },
			])("refuses the impossible judged pair $grade/$verdict", (judgment) => {
				const record = new SessionConfirmationRepBuilder().build();

				expect(() =>
					parseConfirmationRepRecord(
						JSON.stringify({
							...record,
							outcome: "UNSUCCESSFUL",
							stages: [
								{ ...record.stages[FIRST_RECORDED_STAGE_INDEX], ...judgment },
							],
						}),
					),
				).toThrow();
			});
			it(
				"refuses an unsuccessful v2 session rep with passing complete evidence",
				parseConfirmationRepRecordRefusesAnUnsuccessfulV2SessionRepWithPassingCompleteEvidence,
			);
		});
	});
});
