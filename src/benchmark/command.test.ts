import { describe, expect, it } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CommandError, killActiveCommands, runCommand } from "./command";
import CommandOutputProbe from "./command-output-test-probe";
import CommandProcesses from "./command-process-test-fixture";
import CommandSilenceError from "./command-silence-error";
import MissingDirectoryError from "./missing-directory-error";
import { TestResources } from "./test-support";

const PROCESS_POLL_INTERVAL_MS = 25;
const PROCESS_TERMINATION_LIMIT_MS = 1500;

const testResources = TestResources.forEachTest();
const processes = CommandProcesses.forEachTest();

/**
 * What the command failed with, awaited plainly so a command that never ends
 * fails the test at its timeout instead of hanging the run.
 */
async function rejectionOf(
	running: Promise<string>,
): Promise<Error | undefined> {
	try {
		await running;
		return undefined;
	} catch (error) {
		if (error instanceof Error) {
			return error;
		}

		throw error;
	}
}

const killsARunningCommandsWholeProcessGroup = async (): Promise<void> => {
	const sleeper = processes.uniqueSleeper();
	const running = (async () => {
		try {
			return await runCommand(["sh", "-c", `${sleeper} & wait`], process.cwd());
		} catch {
			return "killed";
		}
	})();
	for await (const matches of CommandProcesses.processMatches(sleeper)) {
		if (matches !== "") {
			break;
		}
		await Bun.sleep(PROCESS_POLL_INTERVAL_MS);
	}

	await killActiveCommands();

	expect(await running).toBe("killed");
	expect(await CommandProcesses.matches(sleeper)).toBe("");
};

const killsTheWholeGroupWhenACommandTimesOut = async (): Promise<void> => {
	const sleeper = processes.uniqueSleeper();
	const running = (async () => {
		try {
			return await runCommand(
				["sh", "-c", `${sleeper} & wait`],
				process.cwd(),
				{ timeoutMs: 250 },
			);
		} catch {
			return "killed";
		}
	})();

	expect(await running).toBe("killed");
	expect(await CommandProcesses.matches(sleeper)).toBe("");
};

describe(killActiveCommands.name, () => {
	it(
		"kills a running command's whole process group",
		killsARunningCommandsWholeProcessGroup,
	);

	it(
		"kills the whole group when a command times out",
		killsTheWholeGroupWhenACommandTimesOut,
	);
});

const namesAWorkingDirectoryThatDoesNotExistRatherThanThe =
	async (): Promise<void> => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-command-"));
		testResources.track(directory);
		const missing = join(directory, "absent");

		const failure = runCommand(["git", "status"], missing);

		expect(failure).rejects.toBeInstanceOf(MissingDirectoryError);
		expect(failure).rejects.toMatchObject({ directory: missing });
	};

const keepsTheFailureOfACommandThatRemovedItsOwnWorking =
	async (): Promise<void> => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-command-"));

		const failure = runCommand(
			["sh", "-c", 'rm -rf "$PWD"; echo removed >&2; exit 3'],
			directory,
		);

		expect(failure).rejects.toBeInstanceOf(CommandError);
		expect(failure).rejects.toMatchObject({
			exitCode: 3,
			stderr: "removed\n",
		});
	};

const killsTheCommandWhenItsLineReaderFails = async (): Promise<void> => {
	const sleeper = processes.uniqueSleeper();

	const failure = await runCommand(
		["sh", "-c", `${sleeper} & echo started; wait`],
		process.cwd(),
		{
			onLine: () => {
				throw new Error("reader failed");
			},
		},
	).then(
		() => "finished",
		() => "failed",
	);

	expect(failure).toBe("failed");
	expect(await CommandProcesses.matches(sleeper)).toBe("");
};

const handsEachOutputLineToItsReaderWhileTheCommandStill =
	async (): Promise<void> => {
		const probe = await CommandOutputProbe.create(testResources);

		const running = runCommand(
			[
				"sh",
				"-c",
				`printf 'one\\ntw'; sleep 0.2; printf 'o\\n'; while [ ! -e "$0" ]; do sleep 0.05; done; printf 'three'`,
				probe.gate,
			],
			process.cwd(),
			{ onLine: probe.read },
		);
		await probe.twoLines.promise;
		const beforeExit = [...probe.lines];
		await Bun.write(probe.gate, "");

		const output = await running;

		expect(beforeExit).toEqual(["one", "two"]);
		expect(probe.lines).toEqual(["one", "two", "three"]);
		expect(output).toBe("one\ntwo\nthree");
	};

const endsACommandAtItsWallLimitHoweverMuchItWrites =
	async (): Promise<void> => {
		const failure = await rejectionOf(
			runCommand(
				["sh", "-c", "while true; do echo tick; sleep 0.05; done"],
				process.cwd(),
				{ timeoutMs: 200 },
			),
		);

		expect(failure).toBeInstanceOf(CommandError);
	};

const letsACommandThatKeepsWritingRunPastTheLimitAnd =
	async (): Promise<void> => {
		const output = await runCommand(
			[
				"sh",
				"-c",
				"for i in 1 2 3 4 5 6 7 8 9 10 11 12; do echo $i; sleep 0.05; done",
			],
			process.cwd(),
			{ silenceLimitMs: 200 },
		);

		expect(output).toBe("1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n");
	};

const killsASilentCommandsWholeProcessGroupAndNamesTheSilence =
	async (): Promise<void> => {
		const sleeper = processes.uniqueSleeper();
		const startedAt = Date.now();

		const failure = await rejectionOf(
			runCommand(
				[
					"sh",
					"-c",
					`echo started; printf 'st%sck\\n' u >&2; ${sleeper} & wait`,
				],
				process.cwd(),
				{ silenceLimitMs: 200 },
			),
		);

		expect(failure).toBeInstanceOf(CommandSilenceError);
		expect(failure?.message).toContain("wrote nothing for 200 ms");
		expect(failure?.message).toContain("stuck");
		expect(Date.now() - startedAt).toBeLessThan(PROCESS_TERMINATION_LIMIT_MS);
		expect(await CommandProcesses.matches(sleeper)).toBe("");
	};

const returnsTheOutputOfACommandThatExitedWhileAProcess =
	async (): Promise<void> => {
		const sleeper = processes.uniqueSleeper();

		const output = await runCommand(
			["sh", "-c", `echo result; ${sleeper} & exit 0`],
			process.cwd(),
			{ silenceLimitMs: 200 },
		);

		expect(output).toBe("result\n");
	};

describe(runCommand.name, () => {
	it(
		"names a working directory that does not exist rather than the command",
		namesAWorkingDirectoryThatDoesNotExistRatherThanThe,
	);

	it(
		"keeps the failure of a command that removed its own working directory",
		keepsTheFailureOfACommandThatRemovedItsOwnWorking,
	);

	it(
		"kills the command when its line reader fails",
		killsTheCommandWhenItsLineReaderFails,
	);

	it(
		"hands each output line to its reader while the command still runs, and returns the whole output",
		handsEachOutputLineToItsReaderWhileTheCommandStill,
	);

	it(
		"ends a command at its wall limit however much it writes",
		endsACommandAtItsWallLimitHoweverMuchItWrites,
	);

	describe("with a silence limit", () => {
		it(
			"lets a command that keeps writing run past the limit and returns its whole output",
			letsACommandThatKeepsWritingRunPastTheLimitAnd,
		);

		it(
			"kills a silent command's whole process group and names the silence and its stderr",
			killsASilentCommandsWholeProcessGroupAndNamesTheSilence,
		);

		it(
			"returns the output of a command that exited while a process it left holds its output open",
			returnsTheOutputOfACommandThatExitedWhileAProcess,
		);
	});
});

/**
 * A sleep command no other test run spawns, so a sleeper leaked by one failed
 * run cannot fail the process check of another. Each test's sleepers are
 * killed after it, even when it failed or timed out.
 */
