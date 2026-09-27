import { describe, expect, it } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CommandError, killActiveCommands, runCommand } from "./command";
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
		const running = (async () => {
			try {
				return await runCommand(
					["sh", "-c", "sleep 987654 & wait"],
					process.cwd(),
				);
			} catch {
				return "killed";
			}
		})();
		while ((await pgrepMatches("sleep 987654")) === "") {
			await Bun.sleep(25);
		}

		await killActiveCommands();

		expect(await running).toBe("killed");
		expect(await pgrepMatches("sleep 987654")).toBe("");
	});

	it("kills the whole group when a command times out", async () => {
		const running = (async () => {
			try {
				return await runCommand(
					["sh", "-c", "sleep 987653 & wait"],
					process.cwd(),
					{ timeoutMs: 250 },
				);
			} catch {
				return "killed";
			}
		})();

		expect(await running).toBe("killed");
		expect(await pgrepMatches("sleep 987653")).toBe("");
	});
});

describe(runCommand.name, () => {
	it("kills the command when its line reader fails", async () => {
		const failure = await runCommand(
			["sh", "-c", "sleep 987652 & echo started; wait"],
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
		expect(await pgrepMatches("sleep 987652")).toBe("");
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
});
