import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CommandError, killActiveCommands, runCommand } from "./command";
import { CommandSilenceError } from "./command-silence-error";
import { TestResources } from "./test-support";

const testResources = TestResources.forEachTest();

async function pgrepMatches(pattern: string): Promise<string> {
	try {
		const matches = await runCommand(["pgrep", "-f", pattern], process.cwd());
		return matches.trim();
	} catch (error) {
		if (error instanceof CommandError && error.exitCode === 1) {
			return "";
		}

		throw error;
	}
}

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

describe(killActiveCommands.name, () => {
	it("kills a running command's whole process group", async () => {
		const sleeper = uniqueSleeper();
		const running = (async () => {
			try {
				return await runCommand(
					["sh", "-c", `${sleeper} & wait`],
					process.cwd(),
				);
			} catch {
				return "killed";
			}
		})();
		while ((await pgrepMatches(sleeper)) === "") {
			await Bun.sleep(25);
		}

		await killActiveCommands();

		expect(await running).toBe("killed");
		expect(await pgrepMatches(sleeper)).toBe("");
	});

	it("kills the whole group when a command times out", async () => {
		const sleeper = uniqueSleeper();
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
		expect(await pgrepMatches(sleeper)).toBe("");
	});
});

describe(runCommand.name, () => {
	it("kills the command when its line reader fails", async () => {
		const sleeper = uniqueSleeper();
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
		expect(await pgrepMatches(sleeper)).toBe("");
	});

	it("hands each output line to its reader while the command still runs, and returns the whole output", async () => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-command-"));
		testResources.track(directory);
		const gate = join(directory, "gate");
		const lines: string[] = [];
		const twoLines = Promise.withResolvers<undefined>();
		const running = runCommand(
			[
				"sh",
				"-c",
				`printf 'one\\ntw'; sleep 0.2; printf 'o\\n'; while [ ! -e "$0" ]; do sleep 0.05; done; printf 'three'`,
				gate,
			],
			process.cwd(),
			{
				onLine: (line) => {
					lines.push(line);
					if (lines.length === 2) {
						twoLines.resolve(undefined);
					}
				},
			},
		);
		await twoLines.promise;
		const beforeExit = [...lines];
		await Bun.write(gate, "");

		const output = await running;

		expect(beforeExit).toEqual(["one", "two"]);
		expect(lines).toEqual(["one", "two", "three"]);
		expect(output).toBe("one\ntwo\nthree");
	});

	describe("with a silence limit", () => {
		it("lets a command that keeps writing run past the limit and returns its whole output", async () => {
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
		});

		it("kills a silent command's whole process group and names the silence and its stderr", async () => {
			const sleeper = uniqueSleeper();
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
			expect(Date.now() - startedAt).toBeLessThan(1500);
			expect(await pgrepMatches(sleeper)).toBe("");
		});

		it("returns the output of a command that exited while a process it left holds its output open", async () => {
			const sleeper = uniqueSleeper();

			const output = await runCommand(
				["sh", "-c", `echo result; ${sleeper} & exit 0`],
				process.cwd(),
				{ silenceLimitMs: 200 },
			);

			expect(output).toBe("result\n");
		});
	});
});

let sleepers = 0;
const spawnedSleepers: string[] = [];

afterEach(async () => {
	const spawned = spawnedSleepers.splice(0);
	await Promise.all(
		spawned.map((sleeper) =>
			runCommand(["pkill", "-f", sleeper], process.cwd()).catch(
				() => undefined,
			),
		),
	);
});

/**
 * A sleep command no other test run spawns, so a sleeper leaked by one failed
 * run cannot fail the process check of another. Each test's sleepers are
 * killed after it, even when it failed or timed out.
 */
function uniqueSleeper(): string {
	sleepers += 1;

	const pid = String(process.pid).padStart(7, "0");
	const run = String(sleepers).padStart(3, "0");

	const sleeper = `sleep ${pid}${run}`;
	spawnedSleepers.push(sleeper);

	return sleeper;
}
