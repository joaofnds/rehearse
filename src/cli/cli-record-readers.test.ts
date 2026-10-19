import { describe, expect, it, setDefaultTimeout } from "bun:test";

import { z } from "zod";

import { caseDeclarationPath, casesRoot } from "#benchmark/case";

import { CLI_TEST_TIMEOUT_MS, runCli } from "./cli-process-test-driver";

const RECORD_ID_COLUMN_INDEX = 0;

const EXPECTED_COMPLETED_EXIT_CODE = 0;
const EXPECTED_REFUSAL_EXIT_CODE = 3;
const EXPECTED_USAGE_EXIT_CODE = 2;

setDefaultTimeout(CLI_TEST_TIMEOUT_MS);

async function printsActiveCaseIdsAndOmitsArchivedSetupDiagnostics(): Promise<void> {
	const result = await runCli(["list", "cases"]);

	expect(result.exitCode).toBe(EXPECTED_COMPLETED_EXIT_CODE);
	const printed = result.stdout.trimEnd().split("\n");
	const ids = printed.map((line) => line.split("\t")[RECORD_ID_COLUMN_INDEX]);
	expect(ids).toContain("case:own-work-build");
	expect(ids).not.toContain("case:smoke");
	for (const line of printed) {
		expect(line.startsWith("case:")).toBe(true);
	}
}

async function showsACaseListPrintsExactlyAsTheDeclaration(): Promise<void> {
	const listed = await runCli(["list", "cases"]);
	const id = listed.stdout.split("\t")[RECORD_ID_COLUMN_INDEX] ?? "";

	const expectedPath = caseDeclarationPath(
		id.slice("case:".length),
		casesRoot(),
	);
	const expected = await Bun.file(expectedPath).text();

	const result = await runCli(["show", id, "--json"]);

	expect(result.exitCode).toBe(EXPECTED_COMPLETED_EXIT_CODE);
	expect(result.stderr).toBe("");
	expect(result.stdout).toBe(expected);
	expect(() => {
		JSON.parse(result.stdout);
	}).not.toThrow();
}

async function refusesAnUnknownListKindWithAUsageExit(): Promise<void> {
	const result = await runCli(["list", "bogus"]);

	expect(result.exitCode).toBe(EXPECTED_USAGE_EXIT_CODE);
	expect(result.stdout).toBe("");
	expect(result.stderr).toContain("comparisons");
}

async function refusesShowWithNoArgumentByNamingTheId(): Promise<void> {
	const result = await runCli(["show"]);

	expect(result.exitCode).toBe(EXPECTED_USAGE_EXIT_CODE);
	expect(result.stdout).toBe("");
	expect(result.stderr).toContain("checkpoint:<run>/<stage>");
}

async function refusesAnIdWhosePrefixNamesNoRecordKind(): Promise<void> {
	const result = await runCli(["show", "nonsense"]);

	expect(result.exitCode).toBe(EXPECTED_USAGE_EXIT_CODE);
	expect(result.stdout).toBe("");
}

async function refusesAMalformedBodyByNamingTheFormIts(): Promise<void> {
	const result = await runCli(["show", "checkpoint:only-one-part"]);

	expect(result.exitCode).toBe(EXPECTED_USAGE_EXIT_CODE);
	expect(result.stdout).toBe("");
	expect(result.stderr).toContain("checkpoint:<run>/<stage>");
}

async function refusesAWellFormedIdNamingNoRecordAs(): Promise<void> {
	const result = await runCli(["show", "run:absent"]);

	expect(result.exitCode).toBe(EXPECTED_REFUSAL_EXIT_CODE);
	expect(result.stdout).toBe("");
	expect(result.stderr).toContain("run:absent");
}

async function refusesACorpusSourceThatDoesNotResolveAs(): Promise<void> {
	const result = await runCli([
		"stale",
		"--corpus",
		"/nonexistent-corpus-probe",
	]);

	expect(result.exitCode).toBe(EXPECTED_REFUSAL_EXIT_CODE);
	expect(result.stdout).toBe("");
	expect(result.stderr).toContain("/nonexistent-corpus-probe");
}

async function listsArchivedCases(includeArchived: boolean): Promise<void> {
	const result = await runCli([
		"case",
		"list",
		"--json",
		...(includeArchived ? ["--all"] : []),
	]);

	expect(result.exitCode).toBe(EXPECTED_COMPLETED_EXIT_CODE);
	const declarations = z
		.array(z.object({ id: z.string() }))
		.parse(JSON.parse(result.stdout));
	const ids = declarations.map(({ id }) => id);
	expect(ids).toContain("own-work-build");
	expect(ids.includes("smoke")).toBe(includeArchived);
}

describe("reading the records", () => {
	it(
		"prints active case ids and omits archived setup diagnostics",
		printsActiveCaseIdsAndOmitsArchivedSetupDiagnostics,
	);
	it(
		"shows a case list prints, exactly as the declaration on disk",
		showsACaseListPrintsExactlyAsTheDeclaration,
	);
	it.each([false, true])(
		"lists archived cases through case list only with --all: %s",
		listsArchivedCases,
	);
	it(
		"refuses an unknown list kind with a usage exit code and no stdout",
		refusesAnUnknownListKindWithAUsageExit,
	);
	it(
		"refuses show with no argument by naming the id forms",
		refusesShowWithNoArgumentByNamingTheId,
	);
	it(
		"refuses an id whose prefix names no record kind",
		refusesAnIdWhosePrefixNamesNoRecordKind,
	);
	it(
		"refuses a malformed body by naming the form its prefix takes",
		refusesAMalformedBodyByNamingTheFormIts,
	);
	it(
		"refuses a well-formed id naming no record as a precondition",
		refusesAWellFormedIdNamingNoRecordAs,
	);
	it(
		"refuses a corpus source that does not resolve as a precondition",
		refusesACorpusSourceThatDoesNotResolveAs,
	);
});
