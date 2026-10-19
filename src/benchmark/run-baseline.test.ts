import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { failureOf } from "#cli/cli-test-support";

import { parseCheckpointRecord, recordCheckpoint } from "./checkpoint";
import { runChecks } from "./checks";
import { CommandError } from "./command";
import { RefusedPreconditionError } from "./exit-codes";
import {
	captureRunBaseline,
	ordinaryInitialCheckpointInputs,
} from "./run-baseline";
import {
	RunBaselineCaptureFixture,
	initialCheckpointTarget,
} from "./run-baseline-test-fixtures";
import { TestResources, commitAll } from "./test-support";

const SHA256_HEX_DIGITS = 64;
const testResources = TestResources.forEachTest();
describe(ordinaryInitialCheckpointInputs.name, () => {
	it("writes settings evidence that the production parser accepts", async () => {
		const targetDir = await initialCheckpointTarget(testResources);
		const checkpointDirectory = join(targetDir, "checkpoint");
		const loadedSettings = {
			hashed: {
				path: "stage-settings.json",
				sha256: "b".repeat(SHA256_HEX_DIGITS),
			},
			json: '{"disableAllHooks":true}',
		};
		const inputs = ordinaryInitialCheckpointInputs(
			{
				productBrief: "Brief",
				task: "Task",
				taskSha: "task-sha",
				workflowFiles: [],
			},
			{ effort: "high", loadedSettings, model: "sonnet" },
		);

		await recordCheckpoint(targetDir, checkpointDirectory, inputs);
		const parsed = parseCheckpointRecord(
			await Bun.file(join(checkpointDirectory, "checkpoint.json")).text(),
		);

		expect(parsed.settingsFile).toEqual(loadedSettings.hashed);
	});
});
async function capturesNormalTargetBaseline(): Promise<void> {
	const fixture = new RunBaselineCaptureFixture();

	const baseline = await captureRunBaseline(
		fixture.dependencies,
		{ root: "/target", sha: "source-sha" },
		fixture.target,
	);

	expect(fixture.events).toEqual([
		"/target:setup:bun install",
		"/target:Baseline checks:bun run custom-baseline",
		"/target:clean:source-sha",
		"/target:hash:custom-check.json",
		"/target:context",
	]);
	expect(baseline).toEqual({
		baselineChecks: {
			evidence: [
				{
					claim: "All baseline checks exited successfully",
					path: "bun run custom-baseline",
					source: "local-checks",
				},
			],
			status: "PASS",
		},
		baselineContext: fixture.context,
		baselineHashes: fixture.hashes,
	});
}

async function refusesFailedBaselineCheck(): Promise<void> {
	const failure = new CommandError(["bun", "run", "test:unit"], {
		exitCode: 1,
		stderr: "15 pass, 1 fail",
		stdout: "",
	});

	const refusal = await failureOf(
		captureRunBaseline(
			{
				assertWorkspaceCleanAt: async () => {
					await Promise.resolve();
				},
				captureBaselineContext: async () => await Promise.resolve([]),
				captureFileHashes: async () => await Promise.resolve(new Map()),
				runChecks: async () => {
					await Promise.reject(failure);
				},
				runSetup: async () => {
					await Promise.resolve();
				},
			},
			{ root: "/target", sha: "source-sha" },
			{
				checks: [{ command: ["bun", "run", "test:unit"] }],
				integrityFiles: [],
			},
		),
	);

	expect(refusal).toBeInstanceOf(RefusedPreconditionError);
	expect(refusal.message).toBe(
		"Baseline check failed (exit 1): bun run test:unit",
	);
}

async function refusesFailedTargetSetup(): Promise<void> {
	const failure = new CommandError(["bun", "run", "migrate", "up"], {
		exitCode: 1,
		stderr: "ECONNREFUSED",
		stdout: "",
	});

	const refusal = await failureOf(
		captureRunBaseline(
			{
				assertWorkspaceCleanAt: async () => {
					await Promise.resolve();
				},
				captureBaselineContext: async () => await Promise.resolve([]),
				captureFileHashes: async () => await Promise.resolve(new Map()),
				runChecks: async () => {
					await Promise.resolve();
				},
				runSetup: async () => {
					await Promise.reject(failure);
				},
			},
			{ root: "/target", sha: "source-sha" },
			{
				checks: [{ command: ["bun", "run", "test:unit"] }],
				integrityFiles: [],
				setup: [{ command: ["bun", "run", "migrate", "up"] }],
			},
		),
	);

	expect(refusal).toBeInstanceOf(RefusedPreconditionError);
	expect(refusal.message).toBe(
		"Target setup failed (exit 1): bun run migrate up",
	);
}

async function refusesRealTargetCheck(): Promise<void> {
	const repository = await testResources.createRepository();
	await Bun.write(
		join(repository.directory, "package.json"),
		'{"scripts":{"test:unit":"exit 1"}}\n',
	);
	await commitAll(repository.directory, "chore: fail test:unit");

	const refusal = await failureOf(
		captureRunBaseline(
			{
				assertWorkspaceCleanAt: async () => {
					await Promise.resolve();
				},
				captureBaselineContext: async () => await Promise.resolve([]),
				captureFileHashes: async () => await Promise.resolve(new Map()),
				runChecks: async (targetDir, label, checks) => {
					await runChecks(targetDir, { checks, label }, (message) => {
						expect(message).toBe("\nBaseline checks");
					});
				},
				runSetup: async () => {
					await Promise.resolve();
				},
			},
			{ root: repository.directory, sha: repository.sha },
			{
				checks: [{ command: ["bun", "run", "test:unit"] }],
				integrityFiles: [],
			},
		),
	);

	expect(refusal).toBeInstanceOf(RefusedPreconditionError);
	expect(refusal.message).toBe(
		"Baseline check failed (exit 1): bun run test:unit",
	);
}

async function preservesUnrelatedBaselineFailure(): Promise<void> {
	const bug = new Error("assertWorkspaceCleanAt threw for an unrelated reason");

	const failure = await failureOf(
		captureRunBaseline(
			{
				assertWorkspaceCleanAt: async () => {
					await Promise.reject(bug);
				},
				captureBaselineContext: async () => await Promise.resolve([]),
				captureFileHashes: async () => await Promise.resolve(new Map()),
				runChecks: async () => {
					await Promise.resolve();
				},
				runSetup: async () => {
					await Promise.resolve();
				},
			},
			{ root: "/target", sha: "source-sha" },
			{ checks: [], integrityFiles: [] },
		),
	);

	expect(failure).toBe(bug);
	expect(failure).not.toBeInstanceOf(RefusedPreconditionError);
}

describe(captureRunBaseline.name, () => {
	it(
		"captures the normal run baseline from the pipeline target",
		capturesNormalTargetBaseline,
	);
	it(
		"refuses a target whose declared baseline check fails, naming the command and exit code",
		refusesFailedBaselineCheck,
	);
	it(
		"refuses a target whose setup fails, naming the command and exit code",
		refusesFailedTargetSetup,
	);
	it(
		"refuses a real target repository whose declared check exits non-zero",
		refusesRealTargetCheck,
	);
	it(
		"leaves an unrelated dependency failure unconverted, distinct from a refusal",
		preservesUnrelatedBaselineFailure,
	);
});
