import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import { readCaseDeclaration } from "#benchmark/case";
import type { JsonValue } from "#benchmark/json-value";
import { SET_SPEND_CEILING_COMMAND } from "#benchmark/settings";
import {
	LaunchFixture,
	SESSION_CASE,
	caseDirectories,
	refusalSchema,
} from "#server/launch-http-test-fixture";

import DeclareCaseRequestBuilder from "./declare-case-request-test-builder";
import type { JsonWriteValue } from "./launch-http-test-driver";

const launchFixture = new LaunchFixture();

const { harness } = launchFixture;

afterEach(async () => {
	await launchFixture.dispose();
});

const DECLARED_CASE = new DeclareCaseRequestBuilder().build();

const INVALID_DECLARATIONS = [
	["no check", { ...DECLARED_CASE, checks: [] }, "checks"],
	[
		"an id that is not a case id",
		{ ...DECLARED_CASE, id: "../escape" },
		"lowercase letters, digits, or dashes",
	],
	["no prompt", { ...DECLARED_CASE, prompt: "" }, "prompt"],
	["no effort", { ...DECLARED_CASE, effort: undefined }, "effort"],
	[
		"an effort the claude CLI has no level for",
		{ ...DECLARED_CASE, effort: "turbo" },
		"effort",
	],
	[
		"a corpus file outside the corpus layout",
		{ ...DECLARED_CASE, corpusFiles: ["notes/plan.md"] },
		"notes/plan.md",
	],
	[
		"a corpus file that climbs out of the corpus install",
		{ ...DECLARED_CASE, corpusFiles: ["skills/../../.ssh/id_rsa"] },
		"skills/../../.ssh/id_rsa",
	],
	[
		"a corpus file that climbs out of the corpus layout",
		{ ...DECLARED_CASE, corpusFiles: ["skills/../settings.json"] },
		"skills/../settings.json",
	],
	[
		"a prompt the claude CLI would read as an option",
		{ ...DECLARED_CASE, prompt: "--version" },
		"prompt",
	],
	[
		"a field no case declares",
		{ ...DECLARED_CASE, titel: "A declared case" },
		"titel is not a case.json field",
	],
] as const;

const HAND_DECLARED_FIELDS = [
	["target", { path: "/target" }],
	["stateCheck", { kind: "file-exists", path: "x" }],
	["settings", { permissions: { allow: ["Bash"] } }],
	["agents", { helper: {} }],
	["fixture", "fixture"],
	["transcript", { file: "prefix.jsonl" }],
	["projectFiles", ["CLAUDE.md"]],
] as const;

describe("POST /api/cases", () => {
	it(
		"refuses an id that is already declared, keeping its declaration",
		verifyRefusesAnIdThatIsAlreadyDeclaredKeepingIts,
	);
	it(
		"declares one of two requests that race for one id and refuses the other",
		verifyDeclaresOneOfTwoRequestsThatRaceForOne,
	);
	it(
		"refuses while the settings file cannot be read, writing no case directory",
		verifyRefusesWhileTheSettingsFileCannotBeReadWriting,
	);
	it.each(INVALID_DECLARATIONS)(
		"refuses %s with the reason and writes no case directory",
		verifyRefusesSWithTheReasonAndWritesNoCase,
	);
	it.each(HAND_DECLARED_FIELDS)(
		"refuses a declaration that sets %s, which is declared by hand",
		verifyRefusesADeclarationThatSetsSWhichIsDeclared,
	);
	it(
		"refuses a pipeline case, which is declared through its own route",
		verifyRefusesAPipelineCaseWhichIsDeclaredThroughIts,
	);
});

async function verifyRefusesAnIdThatIsAlreadyDeclaredKeepingIts(): Promise<void> {
	const { declare, casesDirectory } = await harness();

	const response = await declare({
		...DECLARED_CASE,
		id: SESSION_CASE.id,
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(refusalSchema.parse(await response.json()).error).toContain(
		SESSION_CASE.id,
	);
	expect(
		await readCaseDeclaration(SESSION_CASE.id, casesDirectory),
	).toMatchObject(SESSION_CASE);
}

async function verifyDeclaresOneOfTwoRequestsThatRaceForOne(): Promise<void> {
	const { declare, casesDirectory } = await harness();

	const responses = await Promise.all([
		declare(DECLARED_CASE),
		declare({ ...DECLARED_CASE, title: "The other" }),
	]);

	expect(
		responses
			.map(({ status }) => status)
			.toSorted((left, right) => left - right),
	).toEqual([
		HTTP_STATUS.HTTP_STATUS_CREATED,
		HTTP_STATUS.HTTP_STATUS_CONFLICT,
	]);
	expect(
		await readCaseDeclaration(DECLARED_CASE.id, casesDirectory),
	).toMatchObject({ id: DECLARED_CASE.id });
}

async function verifyRefusesWhileTheSettingsFileCannotBeReadWriting(): Promise<void> {
	const { declare, casesDirectory, runsDirectory } = await harness();
	await Bun.write(join(runsDirectory, "settings.json"), "not json");
	const before = await caseDirectories(casesDirectory);

	const response = await declare(DECLARED_CASE);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(refusalSchema.parse(await response.json()).error).toContain(
		SET_SPEND_CEILING_COMMAND,
	);
	expect(await caseDirectories(casesDirectory)).toEqual(before);
}

async function verifyRefusesAPipelineCaseWhichIsDeclaredThroughIts(): Promise<void> {
	const { declare, casesDirectory } = await harness();
	const before = await caseDirectories(casesDirectory);

	const response = await declare({ ...DECLARED_CASE, kind: "pipeline" });

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_BAD_REQUEST);
	expect(refusalSchema.parse(await response.json()).error).toContain(
		"/api/cases/pipeline",
	);
	expect(await caseDirectories(casesDirectory)).toEqual(before);
}

async function verifyRefusesSWithTheReasonAndWritesNoCase(
	_label: string,
	body: JsonWriteValue,
	named: string,
): Promise<void> {
	const { declare, casesDirectory } = await harness();
	const before = await caseDirectories(casesDirectory);

	const response = await declare(body);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_BAD_REQUEST);
	expect(refusalSchema.parse(await response.json()).error).toContain(named);
	expect(await caseDirectories(casesDirectory)).toEqual(before);
}

async function verifyRefusesADeclarationThatSetsSWhichIsDeclared(
	field: string,
	value: JsonValue,
): Promise<void> {
	const { declare, casesDirectory } = await harness();
	const before = await caseDirectories(casesDirectory);

	const response = await declare({ ...DECLARED_CASE, [field]: value });

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_BAD_REQUEST);
	const { error } = refusalSchema.parse(await response.json());
	expect(error).toContain(field);
	expect(error).toContain("by hand");
	expect(await caseDirectories(casesDirectory)).toEqual(before);
}
