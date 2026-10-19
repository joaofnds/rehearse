import { describe, expect, it } from "bun:test";

import { sessionAttemptRecordSchema } from "#benchmark/session-record";

import { failedRecord, record } from "./session-record-test-fixtures";

const CONTRADICTORY_FAILURES = [
	{ error: undefined },
	{ reply: "partial reply" },
	{ checks: [{ detail: "failed", kind: "word-band", status: "FAIL" }] },
];

function acceptsAV2ExecutionFailureWithANonEmptyError(): void {
	expect(sessionAttemptRecordSchema.parse(failedRecord())).toMatchObject({
		error: "provider rejected the call",
		outcome: "EXECUTION_FAILED",
		schemaVersion: 2,
	});
}

function keepsTheV1SuccessSchemaClosedToFailureOnlyFields(): void {
	expect(
		sessionAttemptRecordSchema.safeParse({
			...record(),
			error: "cannot accompany success",
		}).success,
	).toBe(false);
}

describe("sessionAttemptRecordSchema", () => {
	it(
		"accepts a v2 execution failure with a non-empty error",
		acceptsAV2ExecutionFailureWithANonEmptyError,
	);
	it.each(CONTRADICTORY_FAILURES)(
		"refuses contradictory v2 execution-failure evidence",
		(override) => {
			expect(
				sessionAttemptRecordSchema.safeParse({ ...failedRecord(), ...override })
					.success,
			).toBe(false);
		},
	);
	it(
		"keeps the v1 success schema closed to failure-only fields",
		keepsTheV1SuccessSchemaClosedToFailureOnlyFields,
	);
});
