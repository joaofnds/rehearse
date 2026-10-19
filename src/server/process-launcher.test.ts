import { afterEach, describe, expect, it } from "bun:test";

import {
	clearProcessFixtures,
	eventually,
	logFile,
	logText,
	pids,
	processGroup,
	processLocale,
} from "#server/process-launcher-test-fixture";

import processLauncher from "./process-launcher";

const INIT_PROCESS_PID = 1;

afterEach(clearProcessFixtures);

describe(processLauncher.name, () => {
	it(
		"writes the child's output and errors to the log file",
		verifyWritesTheChildSOutputAndErrorsToTheLogFile,
	);

	it(
		"starts the child in a session of its own, so a signal to the server's group misses it",
		verifyStartsTheChildInASessionOfItsOwnSoASignalToTheServerSGroupMissesIt,
	);

	it(
		"passes the environment it was given to the child",
		verifyPassesTheEnvironmentItWasGivenToTheChild,
	);

	it(
		"drops every knob a case declares, so a launch runs the case as declared",
		verifyDropsEveryKnobACaseDeclaresSoALaunchRunsTheCaseAsDeclared,
	);
});

describe(processLauncher.name, () => {
	describe("process identity and stopping", () => {
		it(
			"reports when the process holding a pid started",
			verifyReportsWhenTheProcessHoldingAPidStarted,
		);

		it(
			"reports one start time whatever the server's timezone and locale",
			verifyReportsOneStartTimeWhateverTheServerSTimezoneAndLocale,
		);

		it(
			"reports no start time for a pid no process holds",
			verifyReportsNoStartTimeForAPidNoProcessHolds,
		);

		it(
			"reports a stop the system refuses rather than calling it sent",
			verifyReportsAStopTheSystemRefusesRatherThanCallingItSent,
		);

		it("ends a process it is told to stop", verifyEndsAProcessItIsToldToStop);
	});
});

async function verifyWritesTheChildSOutputAndErrorsToTheLogFile(): Promise<void> {
	const log = await logFile();
	const launcher = processLauncher(
		["sh", "-c", 'echo "out $1"; echo "err $2" >&2', "sh"],
		{},
	);

	pids.push(await launcher.launch(["one", "two"], log));

	expect(
		await eventually(async () => {
			const text = await logText(log);

			return text.includes("out one") && text.includes("err two");
		}),
	).toBe(true);
}

async function verifyStartsTheChildInASessionOfItsOwnSoASignalToTheServerSGroupMissesIt(): Promise<void> {
	const launcher = processLauncher(["sleep"], {});

	const pid = await launcher.launch(["5"], await logFile());
	pids.push(pid);

	expect(await processGroup(pid)).toBe(pid);
	expect(await processGroup(process.pid)).not.toBe(pid);
}

async function verifyPassesTheEnvironmentItWasGivenToTheChild(): Promise<void> {
	const log = await logFile();
	const launcher = processLauncher(["sh", "-c", 'echo "value=$LAUNCH_PROBE"'], {
		LAUNCH_PROBE: "seen",
	});

	pids.push(await launcher.launch([], log));

	expect(
		await eventually(async () => {
			const text = await logText(log);

			return text.includes("value=seen");
		}),
	).toBe(true);
}

async function verifyDropsEveryKnobACaseDeclaresSoALaunchRunsTheCaseAsDeclared(): Promise<void> {
	const log = await logFile();
	const launcher = processLauncher(["sh", "-c", "env"], {
		BENCHMARK_CASE: "other",
		BENCHMARK_EFFORT: "max",
		BENCHMARK_JUDGE_EFFORT: "max",
		BENCHMARK_JUDGE_MODEL: "opus",
		BENCHMARK_LIVE_CORPUS_BACKING_ROOT: "/backing",
		BENCHMARK_MINIMUM_GRADE: "A",
		BENCHMARK_MODEL: "opus",
		BENCHMARK_PIPELINE: "other",
		BENCHMARK_SESSION_BUDGET_USD: "50",
		BENCHMARK_TARGET_DIR: "/some/other/repo",
		KEPT: "yes",
	});

	pids.push(await launcher.launch([], log));

	expect(
		await eventually(async () => {
			const text = await logText(log);

			return text.includes("KEPT=yes");
		}),
	).toBe(true);
	const text = await logText(log);
	const passed = text
		.split("\n")
		.filter((line) => line.startsWith("BENCHMARK_"));
	expect(passed).toEqual(["BENCHMARK_LIVE_CORPUS_BACKING_ROOT=/backing"]);
}

async function verifyReportsWhenTheProcessHoldingAPidStarted(): Promise<void> {
	const launcher = processLauncher(["sleep"], {});
	const pid = await launcher.launch(["5"], await logFile());
	pids.push(pid);

	const startedAt = await launcher.startedAt(pid);

	const table = await Bun.$`ps -o lstart= -p ${pid}`
		.env({ ...Bun.env, LC_ALL: "C", TZ: "UTC" })
		.text();
	expect(startedAt).toBe(table.trim());
}

async function verifyReportsOneStartTimeWhateverTheServerSTimezoneAndLocale(): Promise<void> {
	const launcher = processLauncher(["sleep"], {});
	const pid = await launcher.launch(["5"], await logFile());
	pids.push(pid);
	const locale = processLocale();

	locale.use("UTC", "C");
	const inUtc = await launcher.startedAt(pid);
	locale.use("America/Sao_Paulo", "pt_BR.UTF-8");
	expect(await launcher.startedAt(pid)).toBe(inUtc);
}

async function verifyReportsNoStartTimeForAPidNoProcessHolds(): Promise<void> {
	const launcher = processLauncher(["true"], {});
	const pid = await launcher.launch([], await logFile());
	await eventually(async () => (await launcher.startedAt(pid)) === undefined);

	expect(await launcher.startedAt(pid)).toBeUndefined();
}

function verifyReportsAStopTheSystemRefusesRatherThanCallingItSent(): void {
	const launcher = processLauncher(["sleep"], {});

	expect(() => {
		launcher.stop(INIT_PROCESS_PID);
	}).toThrow();
}

async function verifyEndsAProcessItIsToldToStop(): Promise<void> {
	const launcher = processLauncher(["sleep"], {});
	const pid = await launcher.launch(["5"], await logFile());
	pids.push(pid);

	launcher.stop(pid);

	expect(
		await eventually(async () => (await launcher.startedAt(pid)) === undefined),
	).toBe(true);
}
