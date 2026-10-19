import { describe, expect, it } from "bun:test";

import { sessionAttemptRecordSchema } from "#benchmark/session-record";

import type { CheckResult } from "./session-check";
import {
	FIRST_VALIDATION_ISSUE_INDEX,
	record,
	withoutReply,
} from "./session-record-test-fixtures";

const RESULT_KINDS: CheckResult["kind"][] = [
	"word-band",
	"forbidden-text",
	"forbidden-pattern",
	"tool-calls",
	"files-read",
];

function acceptsACheckedAttemptWhoseOutcomeMatchesItsResults(): void {
	expect(sessionAttemptRecordSchema.parse(record())).toMatchObject({
		outcome: "SUCCESSFUL",
	});
}

function acceptsAnAttemptThatProducedNoReplyWithNoReplyAndNoCheck(): void {
	expect(
		sessionAttemptRecordSchema.parse(
			withoutReply({ checks: [], outcome: "NO_REPLY" }),
		),
	).toMatchObject({ outcome: "NO_REPLY" });
}

function refusesAnAttemptWithNoReplyThatStillRecordsACheckResult(): void {
	const parsed = sessionAttemptRecordSchema.safeParse(
		withoutReply({ outcome: "NO_REPLY" }),
	);

	expect(parsed.success).toBe(false);
	expect(parsed.error?.issues[FIRST_VALIDATION_ISSUE_INDEX]?.message).toBe(
		"A session attempt with no reply evaluates no check",
	);
}

function refusesAnAttemptWithNoReplyThatStillRecordsOne(): void {
	const parsed = sessionAttemptRecordSchema.safeParse(
		record({ checks: [], outcome: "NO_REPLY" }),
	);

	expect(parsed.success).toBe(false);
	expect(parsed.error?.issues[FIRST_VALIDATION_ISSUE_INDEX]?.message).toBe(
		"A session attempt with no reply records no reply",
	);
}

function refusesACheckedAttemptThatRecordsNoReply(): void {
	const parsed = sessionAttemptRecordSchema.safeParse(withoutReply());

	expect(parsed.success).toBe(false);
	expect(parsed.error?.issues[FIRST_VALIDATION_ISSUE_INDEX]?.message).toBe(
		"A session attempt that was checked records the reply it checked",
	);
}

function refusesACheckedAttemptThatEvaluatedNoCheck(): void {
	const parsed = sessionAttemptRecordSchema.safeParse(record({ checks: [] }));

	expect(parsed.success).toBe(false);
	expect(parsed.error?.issues[FIRST_VALIDATION_ISSUE_INDEX]?.message).toBe(
		"A checked session attempt records one result per declared check",
	);
}

function refusesAResultNamingACheckKindThatDoesNotExist(): void {
	const parsed = sessionAttemptRecordSchema.safeParse({
		...record({ checks: [] }),
		checks: [{ detail: "1 word", kind: "typo-band", status: "PASS" }],
	});

	expect(parsed.success).toBe(false);
}

function refusesASuccessfulAttemptWhoseCheckFailed(): void {
	const parsed = sessionAttemptRecordSchema.safeParse(
		record({
			checks: [{ detail: "9 words", kind: "word-band", status: "FAIL" }],
		}),
	);

	expect(parsed.success).toBe(false);
	expect(parsed.error?.issues[FIRST_VALIDATION_ISSUE_INDEX]?.message).toBe(
		"A session attempt is successful when and only when every check passes",
	);
}

function holdsASchemaVersion3RecordToTheSameOutcomeAndCheckConsistencyRulesAsAVersion1Record(): void {
	const current = { ...record(), schemaVersion: 3 };

	expect(sessionAttemptRecordSchema.safeParse(current).success).toBe(true);
	expect(
		sessionAttemptRecordSchema.safeParse({ ...current, checks: [] }).success,
	).toBe(false);
	expect(
		sessionAttemptRecordSchema.safeParse({
			...current,
			outcome: "UNSUCCESSFUL",
		}).success,
	).toBe(false);
	expect(
		sessionAttemptRecordSchema.safeParse({ ...current, reply: undefined })
			.success,
	).toBe(false);
}
describe("sessionAttemptRecordSchema", () => {
	it(
		"accepts a checked attempt whose outcome matches its results",
		acceptsACheckedAttemptWhoseOutcomeMatchesItsResults,
	);
	it(
		"accepts an attempt that produced no reply, with no reply and no check",
		acceptsAnAttemptThatProducedNoReplyWithNoReplyAndNoCheck,
	);
	it(
		"refuses an attempt with no reply that still records a check result",
		refusesAnAttemptWithNoReplyThatStillRecordsACheckResult,
	);
	it(
		"refuses an attempt with no reply that still records one",
		refusesAnAttemptWithNoReplyThatStillRecordsOne,
	);
	it(
		"refuses a checked attempt that records no reply",
		refusesACheckedAttemptThatRecordsNoReply,
	);
	it(
		"refuses a checked attempt that evaluated no check",
		refusesACheckedAttemptThatEvaluatedNoCheck,
	);
	it(
		"refuses a result naming a check kind that does not exist",
		refusesAResultNamingACheckKindThatDoesNotExist,
	);
	it.each(RESULT_KINDS)("accepts a result of the %s kind", (kind) => {
		expect(
			sessionAttemptRecordSchema.safeParse(
				record({ checks: [{ detail: "ok", kind, status: "PASS" }] }),
			).success,
		).toBe(true);
	});
	it(
		"refuses a successful attempt whose check failed",
		refusesASuccessfulAttemptWhoseCheckFailed,
	);
	it(
		"holds a schemaVersion 3 record to the same outcome and check consistency rules as a version 1 record",
		holdsASchemaVersion3RecordToTheSameOutcomeAndCheckConsistencyRulesAsAVersion1Record,
	);
});
