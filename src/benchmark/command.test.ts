import { describe, expect, it } from "bun:test";
import { CommandError, killActiveCommands, runCommand } from "./command";

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
	it("hands each output line to its reader while the command still runs, and returns the whole output", async () => {
		const lines: string[] = [];
		const marker = `${process.pid}-${String(Date.now())}`;
		const running = runCommand(
			[
				"sh",
				"-c",
				`printf 'one\\ntw'; sleep 0.2; printf 'o\\n'; while [ ! -e /tmp/rehearse-${marker} ]; do sleep 0.05; done; printf 'three'`,
			],
			process.cwd(),
			{
				onLine: (line) => {
					lines.push(line);
				},
			},
		);
		while (lines.length < 2) {
			await Bun.sleep(25);
		}
		const beforeExit = [...lines];
		await Bun.write(`/tmp/rehearse-${marker}`, "");

		const output = await running;
		await Bun.file(`/tmp/rehearse-${marker}`).delete();

		expect(beforeExit).toEqual(["one", "two"]);
		expect(lines).toEqual(["one", "two", "three"]);
		expect(output).toBe("one\ntwo\nthree");
	});
});
