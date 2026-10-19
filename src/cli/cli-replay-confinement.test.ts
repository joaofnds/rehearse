import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	setDefaultTimeout,
} from "bun:test";
import { rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { compareAttempts } from "#benchmark/compare-attempts";
import { CliTestWorkspace } from "#cli/cli-test-support";

import {
	ConfinementTestProcesses,
	SIGNALS_LOG,
	isRunning,
	signallingArms,
	signallingFixture,
	signalsIn,
} from "./cli-confinement-test-fixture";
import { recordRunFor } from "./cli-pipeline-test-fixture";
import {
	CLI_TEST_TIMEOUT_MS,
	runCli,
	runPipelineCli,
} from "./cli-process-test-driver";
import { preservedEvidenceIn } from "./cli-record-observation";

const workspace = CliTestWorkspace.forEachTest();

setDefaultTimeout(CLI_TEST_TIMEOUT_MS);

const outside = new ConfinementTestProcesses();

async function cannotSignalAProcessOutsideAReplay(): Promise<void> {
	const { directory, control, binDirectory, target } = await signallingFixture(
		workspace,
		outside,
	);
	const recorded = await recordRunFor(control, binDirectory, target);
	await rm(join(directory, SIGNALS_LOG));

	const result = await runPipelineCli(
		[
			"replay",
			"--run",
			recorded,
			"--stage",
			"shape",
			"--model",
			"sonnet",
			"--session-budget-usd",
			"1",
		],
		control,
		binDirectory,
	);
	workspace.track(...preservedEvidenceIn(result.stderr));

	expect(await signalsIn(directory)).toContain("outside-refused");
	expect(await signalsIn(directory)).not.toContain("outside-stopped");
	expect(isRunning(outside.pid)).toBe(true);
}

async function cannotSignalAProcessOutsideCompareAttempts(): Promise<void> {
	const { directory, environment, armA, armB } = await signallingArms(
		workspace,
		outside,
	);

	await runCli(
		["compare", "attempts", "--arm-a", armA, "--arm-b", armB, "--yes"],
		"empty",
		environment,
	);

	expect(await signalsIn(directory)).toContain("outside-refused");
	expect(await signalsIn(directory)).not.toContain("outside-stopped");
	expect(isRunning(outside.pid)).toBe(true);
}

async function cannotSignalAProcessOutsideCompareExtend(): Promise<void> {
	const { directory, records, environment, arms, armA, armB } =
		await signallingArms(workspace, outside);
	const { reportFile } = await compareAttempts(
		{ armA, armB, runsDirectory: records },
		{ runBaselineGroup: arms.runBaselineGroup },
	);

	await runCli(
		[
			"compare",
			"extend",
			"--comparison",
			basename(dirname(reportFile)),
			"--attempts",
			"2",
			"--yes",
		],
		"empty",
		environment,
	);

	expect(await signalsIn(directory)).toContain("outside-refused");
	expect(await signalsIn(directory)).not.toContain("outside-stopped");
	expect(isRunning(outside.pid)).toBe(true);
}

async function signalsFreelyFromASessionAttemptWhoseCaseAllows(): Promise<void> {
	const { directory, control, binDirectory } = await signallingFixture(
		workspace,
		outside,
	);

	await runPipelineCli(
		["run", "--case", "smoke", "--model", "sonnet"],
		control,
		binDirectory,
	);

	expect(await signalsIn(directory)).toContain("outside-stopped");
}

async function stopsInALaterCallAProcessAnEarlier(): Promise<void> {
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
	expect(signals).toContain("own-stopped");
	expect(signals).not.toContain("own-refused");
	expect(signals).not.toContain("own-gone");
}

describe("a run's sessions", () => {
	beforeEach(() => {
		outside.start();
	});
	afterEach(async () => {
		await outside.stop();
	});
	it(
		"cannot signal a process outside a replay",
		cannotSignalAProcessOutsideAReplay,
	);
	it(
		"cannot signal a process outside compare attempts",
		cannotSignalAProcessOutsideCompareAttempts,
	);
	it(
		"cannot signal a process outside compare extend",
		cannotSignalAProcessOutsideCompareExtend,
	);
	it(
		"signals freely from a session attempt whose case allows no tool",
		signalsFreelyFromASessionAttemptWhoseCaseAllows,
	);
	it(
		"stops in a later call a process an earlier call of the run started",
		stopsInALaterCallAProcessAnEarlier,
	);
});
