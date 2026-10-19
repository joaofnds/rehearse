import { afterEach, describe, expect, it } from "bun:test";

import {
	rewriteSessionAttempt,
	sessionRecordSchema,
} from "#server/history-figures-record-test-fixture";
import {
	clearFigureRoots,
	emptyFixture,
	onlyRowOfKind,
} from "#server/history-figures-workspace-test-fixture";

import {
	EXECUTION_FAILED_CHECKS_REASON,
	NO_REPLY_CHECKS_REASON,
	SESSION_COST_REASON,
} from "./run-history";

afterEach(clearFigureRoots);

describe("/api/runs", () => {
	describe("GET", () => {
		describe("a session attempt row", () => {
			it(
				"carries its recorded outcome, cost and elapsed time",
				verifyCarriesItsRecordedOutcomeCostAndElapsedTime,
			);

			it(
				"carries how many of the checks it declared passed",
				verifyCarriesHowManyOfTheChecksItDeclaredPassed,
			);

			it(
				"carries its checks as unavailable when the session gave no reply to check",
				verifyCarriesItsChecksAsUnavailableWhenTheSessionGave,
			);

			it(
				"carries its checks as unavailable when the session failed to run",
				verifyCarriesItsChecksAsUnavailableWhenTheSessionFailed,
			);

			it(
				"carries its cost as not recorded when the attempt kept no call metrics",
				verifyCarriesItsCostAsNotRecordedWhenTheAttempt,
			);
		});
	});
});

async function verifyCarriesItsRecordedOutcomeCostAndElapsedTime(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.write();

	const row = await onlyRowOfKind(fixture, "session-attempt");

	expect(row).toMatchObject({
		cost: {
			missing: [],
			parts: [{ part: "session", usd: 0.5 }],
			state: "available",
			usd: 0.5,
		},
		status: "SUCCESSFUL",
		wallTime: { ms: 1000, state: "available" },
	});
}

async function verifyCarriesHowManyOfTheChecksItDeclaredPassed(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.write();
	await rewriteSessionAttempt(fixture, {
		checks: [
			{ detail: "120 words", kind: "word-band", status: "PASS" },
			{
				detail: 'says "Great question"',
				kind: "forbidden-text",
				status: "FAIL",
			},
		],
		outcome: "UNSUCCESSFUL",
	});

	const row = await onlyRowOfKind(fixture, "session-attempt");

	expect(row).toMatchObject({
		checks: { declared: 2, passed: 1, state: "available" },
	});
}

async function verifyCarriesItsChecksAsUnavailableWhenTheSessionGave(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.write();
	await rewriteSessionAttempt(fixture, {
		checks: [],
		outcome: "NO_REPLY",
		reply: undefined,
	});

	const row = await onlyRowOfKind(fixture, "session-attempt");

	expect(row).toMatchObject({
		checks: { reasons: [NO_REPLY_CHECKS_REASON], state: "unavailable" },
	});
}

async function verifyCarriesItsChecksAsUnavailableWhenTheSessionFailed(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.write();
	await rewriteSessionAttempt(fixture, {
		checks: [],
		error: "claude exited with code 1",
		outcome: "EXECUTION_FAILED",
		reply: undefined,
		schemaVersion: 2,
		unavailableSubagents: [],
	});

	const row = await onlyRowOfKind(fixture, "session-attempt");

	expect(row).toMatchObject({
		checks: {
			reasons: [EXECUTION_FAILED_CHECKS_REASON],
			state: "unavailable",
		},
	});
}

async function verifyCarriesItsCostAsNotRecordedWhenTheAttempt(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.write();
	const file = Bun.file(fixture.sessionAttemptFile);
	const { metrics: _dropped, ...withoutMetrics } = sessionRecordSchema.parse(
		await file.json(),
	);
	await Bun.write(file, JSON.stringify(withoutMetrics));

	const row = await onlyRowOfKind(fixture, "session-attempt");

	expect(row).toMatchObject({
		cost: { reasons: [SESSION_COST_REASON], state: "unavailable" },
	});
}
