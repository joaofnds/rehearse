import { afterEach, describe, expect, it } from "bun:test";
import { readdir } from "node:fs/promises";
import { constants as HTTP_STATUS } from "node:http2";

import createAppServer from "#server/app";
import { appServer, clearAppRoots, sameOrigin } from "#server/app-test-fixture";

afterEach(clearAppRoots);

const declaration = {
	checks: [{ kind: "word-band", max: 1 }],
	corpusFiles: [],
	id: "declared",
	kind: "session",
	model: "sonnet",
	prompt: "Reply OK.",
	title: "Declared",
	tools: [],
};

const grade = {
	dimensions: [],
	hardBlockers: [],
	note: null,
	requirements: [],
};

describe(createAppServer.name, () => {
	describe("when a request writes", () => {
		describe("to declare a case", registerAppCaseGradingSecurityToDeclareACase);

		describe(
			"to grade a step blind",
			registerAppCaseGradingSecurityToGradeAStepBlind,
		);
	});
});

async function verifyDeclaresTheCaseASameOriginJSONRequestAsks(): Promise<void> {
	const { driver, casesRoot } = await appServer();

	const response = await driver.declareCase(declaration, sameOrigin);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CREATED);
	expect(await readdir(casesRoot)).toContain("declared");
}

async function verifyWritesNoCaseDirectoryForAForeignOrigin(): Promise<void> {
	const { driver, casesRoot } = await appServer();
	const before = await readdir(casesRoot);

	const response = await driver.declareCase(declaration, {
		...sameOrigin,
		origin: "https://evil.example",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_FORBIDDEN);
	expect(await readdir(casesRoot)).toEqual(before);
}

async function verifyWritesNoGradeForAForeignOrigin(): Promise<void> {
	const { driver, runsRoot } = await appServer();
	const before = await readdir(runsRoot, { recursive: true });

	const response = await driver.writeJson({
		body: grade,
		headers: { ...sameOrigin, origin: "https://evil.example" },
		path: "/api/calibration/runs/2026-10-01T10-00-00.000Z/stages/shape/grade",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_FORBIDDEN);
	expect(await readdir(runsRoot, { recursive: true })).toEqual(before);
}

function registerAppCaseGradingSecurityToDeclareACase(): void {
	it(
		"declares the case a same-origin JSON request asks for",
		verifyDeclaresTheCaseASameOriginJSONRequestAsks,
	);

	it(
		"writes no case directory for a foreign Origin",
		verifyWritesNoCaseDirectoryForAForeignOrigin,
	);
}

function registerAppCaseGradingSecurityToGradeAStepBlind(): void {
	it(
		"writes no grade for a foreign Origin",
		verifyWritesNoGradeForAForeignOrigin,
	);
}
