import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	setDefaultTimeout,
} from "bun:test";

import { liveRunLiveness } from "#benchmark/run-liveness";
import { CliTestWorkspace } from "#cli/cli-test-support";
import type { Launcher } from "#server/launches";

import {
	ConfinementTestProcesses,
	eventually,
	isRunning,
	signalsIn,
} from "./cli-confinement-test-fixture";
import blockedConfinedRun, {
	ProcessGroups,
} from "./cli-launched-run-test-fixture";
import { CLI_TEST_TIMEOUT_MS } from "./cli-process-test-driver";
import { recordedCheckout } from "./cli-record-observation";

const workspace = CliTestWorkspace.forEachTest();

setDefaultTimeout(CLI_TEST_TIMEOUT_MS);

const outside = new ConfinementTestProcesses();

const RUN_TO_SESSION_TIMEOUT_MS = 30_000;

const processGroups = new ProcessGroups();

const endsTheConfinedRunAndItsSessionExamples = [
	{
		name: "Stop",
		stop: (launcher: Launcher, pid: number): void => {
			launcher.stop(pid);
		},
	},
	{
		name: "Ctrl-C",
		stop: (_launcher: Launcher, pid: number): void => {
			process.kill(pid, "SIGINT");
		},
	},
	{
		name: "SIGHUP",
		stop: (_launcher: Launcher, pid: number): void => {
			process.kill(pid, "SIGHUP");
		},
	},
];

interface LaunchedRunStop {
	readonly stop: (launcher: Launcher, pid: number) => void;
}
async function stopsConfinedRun({ stop }: LaunchedRunStop): Promise<void> {
	const lowerBoundForSession = 0;

	const { directory, control, launcher, pid, session, launchedAt } =
		await blockedConfinedRun({
			outsidePid: outside.pid,
			processGroups,
			workspace,
		});

	expect(session).toBeGreaterThan(lowerBoundForSession);
	expect(await signalsIn(directory)).toEqual(["outside-refused"]);
	expect(await launcher.startedAt(pid)).toBe(launchedAt);
	const { run, checkout } = await recordedCheckout(control);
	expect(await liveRunLiveness().readMarker(checkout)).toMatchObject({
		pid,
		run,
	});

	stop(launcher, pid);

	expect(
		await eventually(
			async () => await Promise.resolve(!isRunning(pid) && !isRunning(session)),
		),
	).toBe(true);
}

describe("a run's sessions", () => {
	describe("in a run launched as the browser launches one", () => {
		beforeEach(() => {
			outside.start();
		});
		afterEach(async () => {
			await outside.stop();
		});
		afterEach(() => {
			processGroups.cleanUp();
		});
		it.each(endsTheConfinedRunAndItsSessionExamples)(
			"ends the confined run and its session on $name, which stays available",
			stopsConfinedRun,
			RUN_TO_SESSION_TIMEOUT_MS,
		);
	});
});
