import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { parseSessionAttemptState } from "./session-record";

const identity = {
	caseId: "case",
	lineage: "lineage",
	outcome: "SUCCESSFUL",
} as const;
const passed = { name: "saved", status: "PASS", detail: "present" } as const;

describe("parseSessionAttemptState", () => {
	it("reads saved outcomes without parsing unrelated context evidence", () => {
		const record = {
			...identity,
			schemaVersion: 3,
			stateResults: [passed],
			contextEvidence: "unreadable context evidence",
		};

		const state = parseSessionAttemptState(JSON.stringify(record));

		expect(state).toEqual({
			...identity,
			schemaVersion: 3,
			stateResults: [passed],
		});
	});

	it.each([
		[1, "SUCCESSFUL"],
		[2, "EXECUTION_FAILED"],
	] as const)(
		"reads version %i without inventing saved outcomes",
		(schemaVersion, outcome) => {
			expect(
				parseSessionAttemptState(
					JSON.stringify({ ...identity, schemaVersion, outcome }),
				),
			).toEqual({ ...identity, schemaVersion, outcome });
		},
	);

	it.each([
		{ schemaVersion: 4 },
		{ schemaVersion: 2 },
		{ schemaVersion: 3, outcome: "EXECUTION_FAILED" },
		{ schemaVersion: 3, stateResults: [{ ...passed, status: "unknown" }] },
		{ schemaVersion: 3, stateResults: [passed], stateGradingError: "failed" },
		{ schemaVersion: 1, stateResults: [passed] },
		{ schemaVersion: 3, caseId: "" },
	])(
		"refuses unsupported or inconsistent saved-state evidence: %j",
		(fields) => {
			expect(() =>
				parseSessionAttemptState(JSON.stringify({ ...identity, ...fields })),
			).toThrow(z.ZodError);
		},
	);
});
