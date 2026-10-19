import { afterEach, describe, expect, it } from "bun:test";
import { chmod, rm } from "node:fs/promises";
import { join } from "node:path";

import { CASE_ID } from "#benchmark/run-records-test-support";
import {
	ESCAPING_PIPELINE_CASE,
	ESCAPING_RUBRICS_CASE,
	PIPELINE_CASE,
	UNFIT_RUBRIC_CASE,
	UNRUNNABLE_CASE,
	clearCaseRoots,
	serving,
} from "#server/cases-test-fixture";
import { INACCESSIBLE_PERMISSIONS } from "#server/file-permissions-test-support";

afterEach(clearCaseRoots);

describe("GET /api/cases", () => {
	it(
		"reports unavailable definition files without losing the readable declaration",
		verifyReportsUnavailableDefinitionFilesWithoutLosingTheReadableDeclaration,
	);
	it(
		"refuses definition text outside the declared case directory",
		verifyRefusesDefinitionTextOutsideTheDeclaredCaseDirectory,
	);
	describe(
		"when a case's pipeline file is one the harness would refuse",
		registerCasesRefusalsWhenACaseSPipelineFileIsOneTheHarnessWouldRefuse,
	);
	describe(
		"when a case's pipeline file cannot be opened",
		registerCasesRefusalsWhenACaseSPipelineFileCannotBeOpened,
	);
	describe(
		"when a case's stage rubric does not fit its stage",
		registerCasesRefusalsWhenACaseSStageRubricDoesNotFitItsStage,
	);
	describe(
		"when a case's pipeline or rubrics path leaves its case directory",
		registerCasesRefusalsWhenACaseSPipelineOrRubricsPathLeavesItsCaseDirectory,
	);
	it(
		"reports a run record it cannot read apart from the declarations it cannot parse",
		verifyReportsARunRecordItCannotReadApartFrom,
	);
});

async function verifyReportsUnavailableDefinitionFilesWithoutLosingTheReadableDeclaration(): Promise<void> {
	const { casesDirectory, listed } = await serving();
	await rm(join(casesDirectory, CASE_ID, "task.md"));
	expect(await listed(CASE_ID)).toMatchObject({
		definition: {
			evaluation: {
				state: "available",
				text: "The audit trail is complete.",
			},
			prompt: { source: "task.md", state: "unavailable" },
		},
		id: CASE_ID,
	});
}

async function verifyRefusesDefinitionTextOutsideTheDeclaredCaseDirectory(): Promise<void> {
	const { casesDirectory, listed } = await serving();
	await Bun.write(
		join(casesDirectory, CASE_ID, "case.json"),
		JSON.stringify({ ...PIPELINE_CASE, task: "../smoke/case.json" }),
	);
	expect(await listed(CASE_ID)).toMatchObject({
		definition: {
			prompt: {
				reason: `Case ${CASE_ID} names a path outside its case directory: ../smoke/case.json`,
				source: "../smoke/case.json",
				state: "unavailable",
			},
		},
	});
}

async function verifyListsTheCaseWithItsStepsUnavailableAndWhy(): Promise<void> {
	const { listed } = await serving();

	expect(await listed(UNRUNNABLE_CASE.id)).toMatchObject({
		pipeline: {
			reason: `Pipeline stage build names a missing rubric: cases/${UNRUNNABLE_CASE.id}/rubrics/missing.json`,
			state: "unavailable",
		},
	});
}

async function verifyListsTheCaseWithItsStepsUnavailableRatherThan(): Promise<void> {
	const { casesDirectory, listed } = await serving();
	await chmod(
		join(casesDirectory, CASE_ID, "pipeline.json"),
		INACCESSIBLE_PERMISSIONS,
	);

	const reading = await listed(CASE_ID);

	expect(reading).toHaveProperty("pipeline.state", "unavailable");
	expect(reading).toHaveProperty(
		"pipeline.reason",
		expect.stringMatching(
			/^Pipeline definition cannot be read: pipeline\.json/u,
		),
	);
}

async function verifyListsTheCaseWithItsStepsUnavailableAsThe(): Promise<void> {
	const { listed } = await serving();

	const reading = await listed(UNFIT_RUBRIC_CASE.id);

	expect(reading).toHaveProperty("pipeline.state", "unavailable");
	expect(reading).toHaveProperty(
		"pipeline.reason",
		expect.stringMatching(
			/^Pipeline stage build names a rubric it cannot use:/u,
		),
	);
}

async function verifyReportsARunRecordItCannotReadApartFrom(): Promise<void> {
	const { fixture, list } = await serving();
	await fixture.confirmations.records.writeUnreadableGroup("group-x");

	expect(await list()).toMatchObject({
		unreadable: [],
		unreadableRecords: [{ id: "group-x" }],
	});
}

async function verifyEscapingCasePath({
	declaration,
	path,
}: Readonly<{
	declaration: Readonly<{ id: string }>;
	path: string;
}>): Promise<void> {
	const { listed } = await serving();

	expect(await listed(declaration.id)).toMatchObject({
		pipeline: {
			reason: `Case ${declaration.id} names a path outside its case directory: ${path}`,
			state: "unavailable",
		},
	});
}

function registerCasesRefusalsWhenACaseSPipelineFileIsOneTheHarnessWouldRefuse(): void {
	it(
		"lists the case with its steps unavailable and why",
		verifyListsTheCaseWithItsStepsUnavailableAndWhy,
	);
}

function registerCasesRefusalsWhenACaseSPipelineFileCannotBeOpened(): void {
	it(
		"lists the case with its steps unavailable rather than failing the listing",
		verifyListsTheCaseWithItsStepsUnavailableRatherThan,
	);
}

function registerCasesRefusalsWhenACaseSStageRubricDoesNotFitItsStage(): void {
	it(
		"lists the case with its steps unavailable, as the harness refuses it",
		verifyListsTheCaseWithItsStepsUnavailableAsThe,
	);
}

function registerCasesRefusalsWhenACaseSPipelineOrRubricsPathLeavesItsCaseDirectory(): void {
	it.each([
		{
			declaration: ESCAPING_PIPELINE_CASE,
			path: ESCAPING_PIPELINE_CASE.pipeline,
		},
		{
			declaration: ESCAPING_RUBRICS_CASE,
			path: ESCAPING_RUBRICS_CASE.rubrics,
		},
	])("refuses to read $path, as the harness does", verifyEscapingCasePath);
}
