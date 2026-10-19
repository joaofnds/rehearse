import { describe, expect, it } from "bun:test";
import { chmod, mkdir } from "node:fs/promises";
import { join, relative } from "node:path";

import {
	CASES_DIRECTORY,
	CaseDeclarationError,
	listCases,
	readCaseDeclaration,
} from "#benchmark/case";
import { CONTROL_DIR } from "#benchmark/config";
import { TestResources } from "#benchmark/test-support";
import { failureOf } from "#cli/cli-test-support";

import { CaseDeclarationBuilder } from "./case-test-fixtures";

const UNREADABLE_FILE_MODE = 0;

const resources = TestResources.forEachTest();

async function hidesArchivedCasesFromSelectionWhileKeepingTheirDeclarationsReadable(): Promise<void> {
	const root = await resources.createControlDirectory();
	await Array.fromAsync(["audit-log", "smoke"], async (id) => {
		const declaration = await readCaseDeclaration(id);
		await Array.fromAsync([false, true], async (archived) => {
			const caseId = `${id}-${archived ? "archived" : "active"}`;
			await Bun.write(
				join(root, caseId, "case.json"),
				JSON.stringify({ ...declaration, archived, id: caseId }),
			);
		});
	});

	const active = await listCases(root);
	const all = await listCases(root, { includeArchived: true });

	expect(active.unreadable).toEqual([]);
	expect(active.declarations.map(({ id }) => id)).toEqual([
		"audit-log-active",
		"smoke-active",
	]);
	expect(all.unreadable).toEqual([]);
	expect(all.declarations.map(({ id }) => id)).toEqual([
		"audit-log-active",
		"audit-log-archived",
		"smoke-active",
		"smoke-archived",
	]);
	expect(await readCaseDeclaration("smoke-archived", root)).toMatchObject({
		archived: true,
		id: "smoke-archived",
	});
}

async function listsTheReadableCasesPastADirectoryThatHoldsNoDeclaration(): Promise<void> {
	const stray = join(CONTROL_DIR, CASES_DIRECTORY, "zz-stray-probe");
	resources.track(stray);
	await mkdir(stray, { recursive: true });

	const listing = await listCases();

	expect(listing.declarations.map(({ id }) => id)).toContain("audit-log");
	expect(listing.unreadable).toEqual([
		{
			id: "zz-stray-probe",
			reason:
				"Unknown case zz-stray-probe: no declaration at cases/zz-stray-probe/case.json",
		},
	]);
}

async function translatesAnUnreadableDeclarationIntoACaseError(): Promise<void> {
	const caseId = "zz-unreadable-case";
	const root = await resources.createControlDirectory();
	const directory = join(root, caseId);
	const path = join(directory, "case.json");
	await mkdir(directory, { recursive: true });
	await Bun.write(
		path,
		new CaseDeclarationBuilder({ id: caseId }).pipelineJson(),
	);
	await chmod(path, UNREADABLE_FILE_MODE);
	const failure = await failureOf(readCaseDeclaration(caseId, root));
	expect(failure).toBeInstanceOf(CaseDeclarationError);
	expect(failure).toHaveProperty(
		"message",
		expect.stringContaining(
			`Cannot read case ${caseId} declaration at ${relative(CONTROL_DIR, path)}: EACCES`,
		),
	);
}

describe("case catalog", () => {
	it(
		"hides archived cases from selection while keeping their declarations readable",
		hidesArchivedCasesFromSelectionWhileKeepingTheirDeclarationsReadable,
	);
	it(
		"lists the readable cases past a directory that holds no declaration",
		listsTheReadableCasesPastADirectoryThatHoldsNoDeclaration,
	);
	it(
		"translates an unreadable declaration into a case error",
		translatesAnUnreadableDeclarationIntoACaseError,
	);
});
