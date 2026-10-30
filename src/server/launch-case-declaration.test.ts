import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import { z } from "zod";

import { readCaseDeclaration } from "#benchmark/case";
import projectFormatted from "#benchmark/project-format";
import { LaunchFixture } from "#server/launch-http-test-fixture";

import DeclareCaseRequestBuilder from "./declare-case-request-test-builder";

const launchFixture = new LaunchFixture();

const { harness } = launchFixture;

afterEach(async () => {
	await launchFixture.dispose();
});

const DECLARED_CASE = new DeclareCaseRequestBuilder().build();

const declaredSchema = z.object({
	declaration: z.unknown(),
	path: z.string(),
});

const listedCaseIdSchema = z.object({ id: z.string() });

const listedIdsSchema = z.object({
	cases: z.array(listedCaseIdSchema),
});

describe("POST /api/cases", () => {
	it(
		"answers the declaration and the file it wrote, and lists the case",
		verifyAnswersTheDeclarationAndTheFileItWroteAnd,
	);
	it(
		"writes the declaration as typed, without the defaults the parser fills in",
		verifyWritesTheDeclarationAsTypedWithoutTheDefaultsThe,
	);
	it(
		"writes the fields in the order a case.json declares them",
		verifyWritesTheFieldsInTheOrderACaseJson,
	);
	it(
		"keeps the exact declaration bytes written for existing cases",
		verifyKeepsTheExactDeclarationBytesWrittenForExistingCases,
	);
	it(
		"writes the declaration as the project's formatter would, so it commits as written",
		verifyWritesTheDeclarationAsTheProjectSFormatterWould,
	);
	it(
		"writes a declaration the case reader a run uses parses",
		verifyWritesADeclarationTheCaseReaderARunUses,
	);
});

async function verifyAnswersTheDeclarationAndTheFileItWroteAnd(): Promise<void> {
	const { declare, get } = await harness();

	const response = await declare(DECLARED_CASE);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CREATED);
	expect(declaredSchema.parse(await response.json())).toEqual({
		declaration: DECLARED_CASE,
		path: "cases/declared/case.json",
	});
	const listing = await get("/api/cases");
	const { cases } = listedIdsSchema.parse(await listing.json());
	expect(cases.map(({ id }) => id)).toContain(DECLARED_CASE.id);
}

async function verifyWritesTheDeclarationAsTypedWithoutTheDefaultsThe(): Promise<void> {
	const { declare, casesDirectory } = await harness();

	await declare(DECLARED_CASE);

	const written: unknown = await Bun.file(
		join(casesDirectory, DECLARED_CASE.id, "case.json"),
	).json();
	expect(written).toEqual(DECLARED_CASE);
}

async function verifyWritesTheFieldsInTheOrderACaseJson(): Promise<void> {
	const { declare, casesDirectory } = await harness();

	await declare(DECLARED_CASE);

	const written = await Bun.file(
		join(casesDirectory, DECLARED_CASE.id, "case.json"),
	).text();
	const fields = [...written.matchAll(/^\t"(?<field>\w+)":/gmu)].map(
		(match) => match.groups?.["field"],
	);
	expect(fields).toEqual([
		"id",
		"kind",
		"title",
		"prompt",
		"tools",
		"corpusFiles",
		"checks",
		"model",
		"effort",
	]);
}

async function verifyKeepsTheExactDeclarationBytesWrittenForExistingCases(): Promise<void> {
	const { declare, casesDirectory } = await harness();

	await declare(DECLARED_CASE);

	const written = await Bun.file(
		join(casesDirectory, DECLARED_CASE.id, "case.json"),
	).text();
	expect(written).toBe(
		'{\n\t"id": "declared",\n\t"kind": "session",\n\t"title": "A declared case",\n\t"prompt": "Reply OK.",\n\t"tools": [],\n\t"corpusFiles": ["skills/build/SKILL.md"],\n\t"checks": [\n\t\t{\n\t\t\t"kind": "word-band",\n\t\t\t"max": 1\n\t\t}\n\t],\n\t"model": "sonnet",\n\t"effort": "medium"\n}\n',
	);
}

async function verifyWritesTheDeclarationAsTheProjectSFormatterWould(): Promise<void> {
	const { declare, casesDirectory } = await harness();

	await declare(DECLARED_CASE);

	const file = join(casesDirectory, DECLARED_CASE.id, "case.json");
	const written = await Bun.file(file).text();
	expect(await projectFormatted(file, written)).toBe(written);
}

async function verifyWritesADeclarationTheCaseReaderARunUses(): Promise<void> {
	const { declare, casesDirectory } = await harness();

	await declare(DECLARED_CASE);

	expect(
		await readCaseDeclaration(DECLARED_CASE.id, casesDirectory),
	).toMatchObject(DECLARED_CASE);
}
