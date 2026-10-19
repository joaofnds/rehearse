import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import writeComparisonReport from "./comparison-command";
import { writeManifest } from "./session-comparison-group-test-fixture";
import {
	sessionGroupFile,
	updateSessionGroupInputs,
} from "./session-comparison-record-test-fixture";
import { comparisonSuiteRoot } from "./session-comparison-workspace-fixture";

const root = comparisonSuiteRoot();

interface SessionInputChange {
	readonly field: "model" | "effort" | "sessionBudgetUsd";
	readonly value: string | number;
	readonly expected: string;
}

async function refusesChangedSessionInput({
	field,
	value,
	expected,
}: SessionInputChange): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });

	await updateSessionGroupInputs(
		sessionGroupFile({ caseId: "case-one", role: "candidate", runsDirectory }),
		(inputs) => ({ ...inputs, [field]: value }),
	);

	expect(
		writeComparisonReport({ manifestPath, runsDirectory }),
	).rejects.toThrow(`case case-one arm candidate field ${expected}`);
}

describe("session comparison session inputs", () => {
	it.each([
		{ expected: "inputs.model", field: "model", value: "haiku" },
		{ expected: "repRecords[0].effort", field: "effort", value: "high" },
		{
			expected: "inputs.sessionBudgetUsd",
			field: "sessionBudgetUsd",
			value: 0.3,
		},
	] as const)("refuses a changed session $field", refusesChangedSessionInput);
});
