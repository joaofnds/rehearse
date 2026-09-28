import { describe, expect, it } from "bun:test";
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

		it("kills a silent command's whole process group and names the silence", async () => {
			const sleeper = uniqueSleeper();
			const startedAt = Date.now();

			try {
				const running = runCommand(
					["sh", "-c", `echo started; ${sleeper} & wait`],
					process.cwd(),
					{ silenceLimitMs: 200 },
				);

				expect(running).rejects.toBeInstanceOf(CommandSilenceError);
				expect(running).rejects.toThrow("wrote nothing for 200 ms");
				expect(Date.now() - startedAt).toBeLessThan(1500);
				expect(await pgrepMatches(sleeper)).toBe("");
			} finally {
				await runCommand(["pkill", "-f", sleeper], process.cwd()).catch(
					() => undefined,
				);
			}
		});
	});
});

let sleepers = 0;

/**
 * A sleep command no other test run spawns, so a sleeper leaked by one failed
 * run cannot fail the process check of another.
 */
function uniqueSleeper(): string {
	sleepers += 1;

	return `sleep ${process.pid}${sleepers}${Date.now() % 1000}`;
}
