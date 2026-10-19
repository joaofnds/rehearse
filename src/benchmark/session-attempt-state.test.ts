import { describe, expect, it } from "bun:test";

import { z } from "zod";

import { parseSessionAttemptState } from "./session-record";

const identity = {
	caseId: "case",
	lineage: "lineage",
	outcome: "SUCCESSFUL",
} as const;
const passed = { detail: "present", name: "saved", status: "PASS" } as const;

function readsSavedOutcomesWithoutParsingUnrelatedContextEvidence(): void {
	const record = {
		...identity,
		contextEvidence: "unreadable context evidence",
		schemaVersion: 3,
		stateResults: [passed],
	};

	const state = parseSessionAttemptState(JSON.stringify(record));

	expect(state).toEqual({
		...identity,
		schemaVersion: 3,
		stateResults: [passed],
	});
}

describe("parseSessionAttemptState", () => {
	it(
		"reads saved outcomes without parsing unrelated context evidence",
		readsSavedOutcomesWithoutParsingUnrelatedContextEvidence,
	);

	it.each(
		(
			[
				{ outcome: "SUCCESSFUL", schemaVersion: 1 },
				{ outcome: "EXECUTION_FAILED", schemaVersion: 2 },
			] as const
		).map(({ schemaVersion, outcome }) => [schemaVersion, outcome] as const),
	)(
		"reads version %i without inventing saved outcomes",
		(schemaVersion, outcome) => {
			expect(
				parseSessionAttemptState(
					JSON.stringify({ ...identity, outcome, schemaVersion }),
				),
			).toEqual({ ...identity, outcome, schemaVersion });
		},
	);

	it.each([
		{ schemaVersion: 4 },
		{ schemaVersion: 2 },
		{ outcome: "EXECUTION_FAILED", schemaVersion: 3 },
		{ schemaVersion: 3, stateResults: [{ ...passed, status: "unknown" }] },
		{ schemaVersion: 3, stateGradingError: "failed", stateResults: [passed] },
		{ schemaVersion: 1, stateResults: [passed] },
		{ caseId: "", schemaVersion: 3 },
	])(
		"refuses unsupported or inconsistent saved-state evidence: %j",
		(fields) => {
			expect(() =>
				parseSessionAttemptState(JSON.stringify({ ...identity, ...fields })),
			).toThrow(z.ZodError);
		},
	);
});
