import { describe, expect, it, setDefaultTimeout } from "bun:test";
import { join } from "node:path";

import { CliTestWorkspace } from "#cli/cli-test-support";

import { servicesFixture } from "./cli-pipeline-integration-fixture";
import { CLI_TEST_TIMEOUT_MS, runPipelineCli } from "./cli-process-test-driver";
import {
	REMOVED_CONTAINERS,
	linesIn,
	sawDatabaseAddress,
} from "./cli-provider-test-fixture";

const workspace = CliTestWorkspace.forEachTest();

setDefaultTimeout(CLI_TEST_TIMEOUT_MS);

async function givesItsSetupChecksAndStageSessionsTheAddress(): Promise<void> {
	const fixture = await servicesFixture(workspace);

	await runPipelineCli(
		[
			"run",
			"--case",
			"audit-log",
			"--model",
			"sonnet",
			"--target",
			fixture.target,
			"--json",
		],
		fixture.control,
		fixture.binDirectory,
	);

	expect({
		checks: await sawDatabaseAddress(fixture.seen, "checks.log"),
		sessions: await sawDatabaseAddress(fixture.seen, "sessions.log"),
		setup: await sawDatabaseAddress(fixture.seen, "setup.log"),
	}).toEqual({ checks: true, sessions: true, setup: true });
}

async function removesEveryContainerItStartedOnceTheRunEnds(): Promise<void> {
	const fixture = await servicesFixture(workspace);

	await runPipelineCli(
		[
			"run",
			"--case",
			"audit-log",
			"--model",
			"sonnet",
			"--target",
			fixture.target,
			"--json",
		],
		fixture.control,
		fixture.binDirectory,
	);

	expect(await linesIn(join(fixture.binDirectory, REMOVED_CONTAINERS))).toEqual(
		["container-postgres", "container-redis"],
	);
}

describe("rehearse", () => {
	describe("when the case's target starts containers", () => {
		it(
			"gives its setup, checks and stage sessions the address its database container publishes",
			givesItsSetupChecksAndStageSessionsTheAddress,
		);
		it(
			"removes every container it started once the run ends",
			removesEveryContainerItStartedOnceTheRunEnds,
		);
	});
});
