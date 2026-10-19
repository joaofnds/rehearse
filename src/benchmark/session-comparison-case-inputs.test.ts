import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import writeComparisonReport from "./comparison-command";
import {
	updateAttemptChecks,
	updateAttemptPrompts,
} from "./session-comparison-attempt-record-fixture";
import { writeManifest } from "./session-comparison-group-test-fixture";
import {
	changedSessionCase,
	sessionGroupFile,
	updateFrozenCase,
} from "./session-comparison-record-test-fixture";
import type { SharedSessionCaseField } from "./session-comparison-test-contract";
import { comparisonSuiteRoot } from "./session-comparison-workspace-fixture";

const root = comparisonSuiteRoot();

async function testRefusesAChangedSharedPromptWithItsCaseAndArmsNamed(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });

	await updateFrozenCase(
		sessionGroupFile({
			caseId: "case-one",
			role: "candidate",
			runsDirectory,
		}),
		(declaration) => {
			if (declaration.kind !== "session") {
				throw new Error("expected a session case");
			}

			return { ...declaration, prompt: "A different prompt." };
		},
	);

	await updateAttemptPrompts({
		groupFile: sessionGroupFile({
			caseId: "case-one",
			role: "candidate",
			runsDirectory,
		}),
		prompt: "A different prompt.",
	});

	expect(
		writeComparisonReport({ manifestPath, runsDirectory }),
	).rejects.toThrow(
		"case case-one arms baseline and candidate field inputs.files.case.prompt",
	);
}

async function testRefusesAChangedFixtureDeclarationByNamingTheInput(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });

	await updateFrozenCase(
		sessionGroupFile({
			caseId: "case-one",
			role: "candidate",
			runsDirectory,
		}),
		(declaration) => {
			if (declaration.kind !== "session") {
				throw new Error("expected a session case");
			}

			return { ...declaration, fixture: "fixture" };
		},
	);

	expect(
		writeComparisonReport({ manifestPath, runsDirectory }),
	).rejects.toThrow(
		"case case-one arms baseline and candidate field inputs.files.case.fixture",
	);
}

async function refusesChangedSharedCaseField(
	field: SharedSessionCaseField,
): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });

	await updateFrozenCase(
		sessionGroupFile({
			caseId: "case-one",
			role: "candidate",
			runsDirectory,
		}),
		(declaration) => changedSessionCase(field, declaration),
	);

	expect(
		writeComparisonReport({ manifestPath, runsDirectory }),
	).rejects.toThrow(
		`case case-one arms baseline and candidate field inputs.files.case.${field}`,
	);
}

async function refusesChangedSharedChecks(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });

	await updateFrozenCase(
		sessionGroupFile({
			caseId: "case-one",
			role: "candidate",
			runsDirectory,
		}),
		(declaration) => changedSessionCase("checks", declaration),
	);

	await updateAttemptChecks(
		sessionGroupFile({
			caseId: "case-one",
			role: "candidate",
			runsDirectory,
		}),
		[
			{ detail: "0 tool calls", kind: "tool-calls", status: "PASS" },
			{ detail: "1 word", kind: "word-band", status: "PASS" },
		],
	);

	expect(
		writeComparisonReport({ manifestPath, runsDirectory }),
	).rejects.toThrow(
		"case case-one arms baseline and candidate field inputs.files.case.checks",
	);
}

describe("session comparison case inputs", () => {
	it(
		"refuses a changed shared prompt with its case and arms named",
		testRefusesAChangedSharedPromptWithItsCaseAndArmsNamed,
	);

	it(
		"refuses a changed fixture declaration by naming the input",
		testRefusesAChangedFixtureDeclarationByNamingTheInput,
	);

	it.each([
		"tools",
		"settings",
		"agents",
		"projectFiles",
		"stateCheck",
	] as const)(
		"refuses a changed shared case %s",
		refusesChangedSharedCaseField,
	);

	it("refuses changed shared case checks", refusesChangedSharedChecks);
});
