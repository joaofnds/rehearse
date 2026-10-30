import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import { benchmarkRunPaths } from "#benchmark/run-layout";
import { SET_SPEND_CEILING_COMMAND } from "#benchmark/settings";
import type { LaunchRequestBody } from "#server/launch-http-test-driver";
import {
	BROKEN_CASE,
	LaunchFixture,
	recordedRunWithCheckpoint,
	refusalSchema,
} from "#server/launch-http-test-fixture";

const launchFixture = new LaunchFixture();

const { harness } = launchFixture;

afterEach(async () => {
	await launchFixture.dispose();
});

const INVALID_LAUNCH_REQUESTS = [
	[
		"an attempt count the dialog does not offer",
		{ attempts: 5, caseId: "pipe-case", kind: "case" },
	],
	["an unknown kind", { attempts: 1, caseId: "pipe-case", kind: "review" }],
	[
		"a malformed case id",
		{ attempts: 1, caseId: "../pipe-case", kind: "case" },
	],
	[
		"a field the launch does not take",
		{ attempts: 1, caseId: "pipe-case", kind: "case", model: "opus" },
	],
] as const;

const UNKNOWN_LAUNCH_TARGETS = [
	[
		"a case with no declaration",
		{ attempts: 1, caseId: "missing-case", kind: "case" },
	],
	[
		"a run never recorded",
		{
			attempts: 1,
			kind: "replay",
			run: "2026-01-01T00-00-00.000Z",
			stage: "build",
		},
	],
	[
		"a run named by a path",
		{ attempts: 1, kind: "replay", run: "../../etc", stage: "build" },
	],
	[
		"a stage the run's pipeline lacks",
		{
			attempts: 1,
			kind: "replay",
			run: "2026-09-03T00-00-00.000Z",
			stage: "ship",
		},
	],
] as const;

describe("POST /api/launches", () => {
	it.each(INVALID_LAUNCH_REQUESTS)(
		"refuses %s as a bad request and starts nothing",
		verifyInvalidLaunchRequests,
	);
	it.each(UNKNOWN_LAUNCH_TARGETS)(
		"refuses %s as not found and starts nothing",
		verifyUnknownLaunchTargets,
	);
	it(
		"refuses a replay whose preceding checkpoint was never recorded",
		verifyRefusesAReplayWhosePrecedingCheckpointWasNeverRecorded,
	);
	it(
		"refuses a recorded case whose declaration does not parse as a conflict, not as unknown",
		verifyRefusesARecordedCaseWhoseDeclarationDoesNotParse,
	);
	it(
		"refuses a recorded run whose manifest does not parse as a conflict",
		verifyRefusesARecordedRunWhoseManifestDoesNotParse,
	);
	it(
		"refuses a case that declares no model, since the child cannot ask for one",
		verifyRefusesACaseThatDeclaresNoModelSinceThe,
	);
	it(
		"refuses a case that declares no effort, since the child cannot ask for one",
		verifyRefusesACaseThatDeclaresNoEffort,
	);
	it(
		"refuses while the settings file cannot be read, without the records path",
		verifyRefusesWhileTheSettingsFileCannotBeReadWithout,
	);
});

async function verifyRefusesAReplayWhosePrecedingCheckpointWasNeverRecorded(): Promise<void> {
	const { launcher, post, runsDirectory } = await harness();
	const run = await recordedRunWithCheckpoint(runsDirectory, "missing");

	const response = await post({
		attempts: 1,
		kind: "replay",
		run,
		stage: "discuss",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(refusalSchema.parse(await response.json()).error).toContain("initial");
	expect(launcher.launches).toEqual([]);
}

async function verifyRefusesARecordedCaseWhoseDeclarationDoesNotParse(): Promise<void> {
	const { launcher, post } = await harness();

	const response = await post({
		attempts: 1,
		caseId: BROKEN_CASE.id,
		kind: "case",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(launcher.launches).toEqual([]);
}

async function verifyRefusesARecordedRunWhoseManifestDoesNotParse(): Promise<void> {
	const { launcher, post, runsDirectory } = await harness();
	const run = await recordedRunWithCheckpoint(runsDirectory, "recorded");
	await Bun.write(
		benchmarkRunPaths(runsDirectory, run).manifestFile,
		"not json",
	);

	const response = await post({
		attempts: 1,
		kind: "replay",
		run,
		stage: "discuss",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(refusalSchema.parse(await response.json()).error).not.toContain(
		runsDirectory,
	);
	expect(launcher.launches).toEqual([]);
}

async function verifyRefusesACaseThatDeclaresNoModelSinceThe(): Promise<void> {
	const { launcher, post } = await harness();

	const response = await post({
		attempts: 1,
		caseId: "no-model",
		kind: "case",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(refusalSchema.parse(await response.json()).error).toContain("model");
	expect(launcher.launches).toEqual([]);
}

async function verifyRefusesACaseThatDeclaresNoEffort(): Promise<void> {
	const { launcher, post } = await harness();

	const response = await post({
		attempts: 1,
		caseId: "no-effort",
		kind: "case",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(refusalSchema.parse(await response.json()).error).toContain("effort");
	expect(launcher.launches).toEqual([]);
}

async function verifyRefusesWhileTheSettingsFileCannotBeReadWithout(): Promise<void> {
	const { launcher, post, runsDirectory } = await harness("missing");
	await Bun.write(join(runsDirectory, "settings.json"), "not json");

	const response = await post({
		attempts: 1,
		caseId: "pipe-case",
		kind: "case",
	});
	const { error } = refusalSchema.parse(await response.json());

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(error).toContain(SET_SPEND_CEILING_COMMAND);
	expect(error).not.toContain(runsDirectory);
	expect(launcher.launches).toEqual([]);
}

async function verifyInvalidLaunchRequests(
	_label: string,
	body: LaunchRequestBody,
): Promise<void> {
	const { launcher, post } = await harness();

	const response = await post(body);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_BAD_REQUEST);
	expect(refusalSchema.parse(await response.json()).error).not.toBe("");
	expect(launcher.launches).toEqual([]);
}

async function verifyUnknownLaunchTargets(
	_label: string,
	body: LaunchRequestBody,
): Promise<void> {
	const { launcher, post, runsDirectory } = await harness();
	await recordedRunWithCheckpoint(runsDirectory, "recorded");

	const response = await post(body);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_NOT_FOUND);
	expect(launcher.launches).toEqual([]);
}
