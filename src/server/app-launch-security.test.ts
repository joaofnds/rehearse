import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import { z } from "zod";

import {
	RUN as ANALYZED_RUN,
	runStoppedAtBuild,
} from "#benchmark/root-cause-analysis-test-support";
import createAppServer from "#server/app";
import {
	PORT,
	appServer,
	clearAppRoots,
	sameOrigin,
} from "#server/app-test-fixture";

afterEach(clearAppRoots);

const launchedSchema = z.object({ id: z.string() });

const analysis = {
	kind: "analysis",
	run: ANALYZED_RUN,
	statedUsd: 1,
};

const launch = {
	attempts: 1,
	caseId: "smoke",
	kind: "case",
};

describe(createAppServer.name, () => {
	describe("when a request writes", () => {
		describe(
			"to request a root-cause analysis",
			registerAppLaunchSecurityToRequestARootCauseAnalysis,
		);

		describe("to launch a run", registerAppLaunchSecurityToLaunchARun);
	});
});

async function verifyStartsTheAnalysisASameOriginJSONRequestAsks(): Promise<void> {
	const expectedLaunchCount = 1;

	const { driver, launcher, runsRoot } = await appServer();
	await runStoppedAtBuild(runsRoot);

	const response = await driver.launch(analysis, sameOrigin);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_ACCEPTED);
	expect(launcher.launches).toHaveLength(expectedLaunchCount);
}

async function verifyStartsTheLaunchASameOriginJSONRequestAsks(): Promise<void> {
	const expectedLaunchCount = 1;

	const { driver, launcher } = await appServer();

	const response = await driver.launch(launch, sameOrigin);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_ACCEPTED);
	expect(launcher.launches).toHaveLength(expectedLaunchCount);
}

async function verifyStopsNothingForAForeignOrigin(): Promise<void> {
	const { driver, launcher } = await appServer();
	const started = await driver.launch(launch, sameOrigin);
	const { id } = launchedSchema.parse(await started.json());

	const response = await driver.stopLaunch(id, {
		...sameOrigin,
		origin: "https://evil.example",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_FORBIDDEN);
	expect(launcher.stopped).toEqual([]);
}

async function verifyRefusedAnalysisHeaders(
	_label: string,
	headers: Readonly<Record<string, string>>,
): Promise<void> {
	const { driver, launcher, runsRoot } = await appServer();
	await runStoppedAtBuild(runsRoot);

	const response = await driver.launch(analysis, headers);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_FORBIDDEN);
	expect(launcher.launches).toEqual([]);
}

function registerAppLaunchSecurityToRequestARootCauseAnalysis(): void {
	it(
		"starts the analysis a same-origin JSON request asks for",
		verifyStartsTheAnalysisASameOriginJSONRequestAsks,
	);

	it.each([
		["a foreign Origin", { ...sameOrigin, origin: "https://evil.example" }],
		["a cross-site fetch", { ...sameOrigin, "sec-fetch-site": "cross-site" }],
		[
			"a rebound Host",
			{ ...sameOrigin, host: `rebound.example:${String(PORT)}` },
		],
		["a form body", { ...sameOrigin, "content-type": "text/plain" }],
	])("starts nothing for %s", verifyRefusedAnalysisHeaders);
}

function registerAppLaunchSecurityToLaunchARun(): void {
	it(
		"starts the launch a same-origin JSON request asks for",
		verifyStartsTheLaunchASameOriginJSONRequestAsks,
	);

	it.each([
		["a foreign Origin", { ...sameOrigin, origin: "https://evil.example" }],
		[
			"a rebound Host",
			{ ...sameOrigin, host: `rebound.example:${String(PORT)}` },
		],
		["a form body", { ...sameOrigin, "content-type": "text/plain" }],
	])("starts nothing for %s", async (_label, headers) => {
		const { driver, launcher } = await appServer();

		const response = await driver.launch(launch, headers);

		expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_FORBIDDEN);
		expect(launcher.launches).toEqual([]);
	});

	it("stops nothing for a foreign Origin", verifyStopsNothingForAForeignOrigin);
}
