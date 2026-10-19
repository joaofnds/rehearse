import { describe, expect, it } from "bun:test";
import { mkdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import type { CaseDeclaration } from "#benchmark/case";
import {
	CASES_DIRECTORY,
	caseDeclarationSchema,
	casesRoot,
} from "#benchmark/case";
import { CONTROL_DIR, DEFAULT_CASE_ID } from "#benchmark/config";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { TestResources } from "#benchmark/test-support";
import { requireCase, runCaseList, runCaseShow } from "#cli/case-command";
import { failureOf, recordOutput } from "#cli/cli-test-support";

function printedDeclarations(text: string): readonly CaseDeclaration[] {
	return z.array(caseDeclarationSchema).parse(z.json().parse(JSON.parse(text)));
}

function printedDeclaration(text: string): CaseDeclaration {
	return caseDeclarationSchema.parse(z.json().parse(JSON.parse(text)));
}

const resources = TestResources.forEachTest();

async function loadsAnArchivedCaseWhenExplicitlyRequested(): Promise<void> {
	const loaded = await requireCase("smoke");

	expect(loaded.declaration).toMatchObject({ archived: true, id: "smoke" });
	expect(loaded.kind).toBe("session");
}

async function refusesACaseWhoseDeclaredPipelineIsNotThere(): Promise<void> {
	const id = "zz-missing-pipeline-probe";
	const directory = join(casesRoot(), id);
	resources.track(directory);
	await mkdir(directory, { recursive: true });
	await Promise.all([
		Bun.write(join(directory, "backlog-seed.md"), "Task"),
		Bun.write(join(directory, "product-brief.md"), "Brief"),
		Bun.write(join(directory, "rubric.md"), "Rubric"),
	]);
	await Bun.write(
		join(directory, "case.json"),
		JSON.stringify({
			finalRubric: "rubric.md",
			id,
			kind: "pipeline",
			pipeline: "pipelines/missing.json",
			productBrief: "product-brief.md",
			rubrics: "rubrics",
			target: { path: "/tmp/does-not-matter" },
			task: "backlog-seed.md",
			title: "Missing pipeline",
		}),
	);

	const failure = await failureOf(requireCase(id));

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toContain("pipelines/missing.json");
}

async function printsOneLinePerDeclaredCaseWithItsId(): Promise<void> {
	const recorder = recordOutput();

	await runCaseList({ json: false }, recorder.output);

	expect(recorder.stderr).toEqual([]);
	const lines = recorder.stdout.join("").trimEnd().split("\n");
	expect(lines).toContain(
		`${DEFAULT_CASE_ID}\tAsynchronous audit log module against the NestJS template`,
	);
}

async function printsEveryDeclarationAsOneJSONArrayWithJson(): Promise<void> {
	const recorder = recordOutput();

	await runCaseList({ json: true }, recorder.output);

	const declarations = printedDeclarations(recorder.stdout.join(""));

	expect(declarations.map(({ id }) => id)).toContain(DEFAULT_CASE_ID);
}

async function namesTheCaseDirectoryAsARefusedPreconditionWhen(): Promise<void> {
	const casesDirectory = join(CONTROL_DIR, CASES_DIRECTORY);
	const aside = `${casesDirectory}-absent-probe`;
	await rename(casesDirectory, aside);

	try {
		const failure = await failureOf(
			runCaseList({ json: false }, recordOutput().output),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure.message).toContain(CASES_DIRECTORY);
	} finally {
		await rename(aside, casesDirectory);
	}
}

async function reportsAnUnreadableCaseDirectoryOnStderrAndStill(): Promise<void> {
	const stray = join(CONTROL_DIR, CASES_DIRECTORY, "zz-stray-probe");
	await mkdir(stray, { recursive: true });

	try {
		const recorder = recordOutput();

		await runCaseList({ json: false }, recorder.output);

		expect(recorder.stdout.join("")).toContain(DEFAULT_CASE_ID);
		expect(recorder.stderr.join("")).toContain("zz-stray-probe");
	} finally {
		await rm(stray, { force: true, recursive: true });
	}
}

async function printsExactlyTheParsedDeclarationWithJson(): Promise<void> {
	const recorder = recordOutput();

	await runCaseShow({ caseId: DEFAULT_CASE_ID, json: true }, recorder.output);

	expect(recorder.stderr).toEqual([]);
	const printed = printedDeclaration(recorder.stdout.join(""));

	expect(printed.id).toBe(DEFAULT_CASE_ID);
}

async function printsTheDeclarationFileSPathWithoutJson(): Promise<void> {
	const recorder = recordOutput();

	await runCaseShow({ caseId: DEFAULT_CASE_ID, json: false }, recorder.output);

	expect(recorder.stdout.join("")).toBe(
		`${join(CONTROL_DIR, CASES_DIRECTORY, DEFAULT_CASE_ID, "case.json")}\n`,
	);
}

async function refusesAnUnknownCaseAsARefusedPreconditionNaming(): Promise<void> {
	const recorder = recordOutput();

	const failure = await failureOf(
		runCaseShow({ caseId: "missing", json: true }, recorder.output),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toContain("missing");
	expect(recorder.stdout).toEqual([]);
}

async function refusesAMissingCaseIdAsAUsageError(): Promise<void> {
	const recorder = recordOutput();

	const failure = await failureOf(
		runCaseShow({ caseId: undefined, json: true }, recorder.output),
	);

	expect(failure.message).toContain("rehearse case show <case-id>");
}

describe(requireCase.name, () => {
	it(
		"loads an archived case when explicitly requested",
		loadsAnArchivedCaseWhenExplicitlyRequested,
	);
	it(
		"refuses a case whose declared pipeline is not there, naming it",
		refusesACaseWhoseDeclaredPipelineIsNotThere,
	);
});

describe(runCaseList.name, () => {
	it.each([false, true])(
		"includes archived declarations only when requested: %s",
		async (includeArchived) => {
			const recorder = recordOutput();

			await runCaseList({ includeArchived, json: true }, recorder.output);

			const declarations = printedDeclarations(recorder.stdout.join(""));
			expect(declarations.some(({ id }) => id === "smoke")).toBe(
				includeArchived,
			);
			expect(declarations.map(({ id }) => id)).toContain(DEFAULT_CASE_ID);
		},
	);
	it(
		"prints one line per declared case with its id and title",
		printsOneLinePerDeclaredCaseWithItsId,
	);
	it(
		"prints every declaration as one JSON array with --json",
		printsEveryDeclarationAsOneJSONArrayWithJson,
	);
	it(
		"names the case directory as a refused precondition when it is absent",
		namesTheCaseDirectoryAsARefusedPreconditionWhen,
	);
	it(
		"reports an unreadable case directory on stderr and still lists the rest",
		reportsAnUnreadableCaseDirectoryOnStderrAndStill,
	);
});

describe(runCaseShow.name, () => {
	it(
		"prints exactly the parsed declaration with --json",
		printsExactlyTheParsedDeclarationWithJson,
	);
	it(
		"prints the declaration file's path without --json",
		printsTheDeclarationFileSPathWithoutJson,
	);
	it(
		"refuses an unknown case as a refused precondition, naming it",
		refusesAnUnknownCaseAsARefusedPreconditionNaming,
	);
	it(
		"refuses a missing case id as a usage error",
		refusesAMissingCaseIdAsAUsageError,
	);
});
