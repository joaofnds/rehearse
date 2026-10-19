import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	setDefaultTimeout,
} from "bun:test";

import { CliTestWorkspace } from "#cli/cli-test-support";

import {
	ConfinementTestProcesses,
	isRunning,
	signallingFixture,
	signalsIn,
} from "./cli-confinement-test-fixture";
import { CLI_TEST_TIMEOUT_MS, runPipelineCli } from "./cli-process-test-driver";

const workspace = CliTestWorkspace.forEachTest();

setDefaultTimeout(CLI_TEST_TIMEOUT_MS);

const outside = new ConfinementTestProcesses();

async function cannotSignalAProcessOutsideAPipelineRunWhich(): Promise<void> {
	const lowerBoundForSignalsCount = 1;

	const { directory, control, binDirectory, target } = await signallingFixture(
		workspace,
		outside,
	);

	await runPipelineCli(
		["run", "--case", "audit-log", "--model", "sonnet", "--target", target],
		control,
		binDirectory,
	);

	const signals = await signalsIn(directory);
	expect(signals.length).toBeGreaterThan(lowerBoundForSignalsCount);
	expect(signals).not.toContain("outside-stopped");
	expect(isRunning(outside.pid)).toBe(true);
}

async function cannotSignalAProcessOutsideASessionAttemptWhose(): Promise<void> {
	const { directory, control, binDirectory } = await signallingFixture(
		workspace,
		outside,
	);

	await runPipelineCli(
		["run", "--case", "state-probe", "--model", "sonnet"],
		control,
		binDirectory,
	);

	expect(await signalsIn(directory)).toContain("outside-refused");
	expect(await signalsIn(directory)).not.toContain("outside-stopped");
	expect(isRunning(outside.pid)).toBe(true);
}

describe("a run's sessions", () => {
	beforeEach(() => {
		outside.start();
	});
	afterEach(async () => {
		await outside.stop();
	});
	it(
		"cannot signal a process outside a pipeline run, which keeps running",
		cannotSignalAProcessOutsideAPipelineRunWhich,
	);
	it(
		"cannot signal a process outside a session attempt whose case allows Bash",
		cannotSignalAProcessOutsideASessionAttemptWhose,
	);
});
