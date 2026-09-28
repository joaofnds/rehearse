import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { processLauncher } from "./process-launcher";

/** Polls, because the detached child runs on its own schedule. */
async function eventually(check: () => Promise<boolean>): Promise<boolean> {
	for (let tries = 0; tries < 100; tries += 1) {
		if (await check()) {
			return true;
		}
		await Bun.sleep(20);
	}

	return false;
}

function logText(log: string): Promise<string> {
	return Bun.file(log)
		.text()
		.catch(() => "");
}

async function processGroup(pid: number): Promise<number> {
	const output = await Bun.$`ps -o pgid= -p ${pid}`.text();

	return Number(output.trim());
}

describe(processLauncher.name, () => {
	const roots: string[] = [];
	const pids: number[] = [];

	afterEach(async () => {
		for (const pid of pids.splice(0)) {
			try {
				process.kill(pid, "SIGKILL");
			} catch {
				// The child already exited.
			}
		}
		await Promise.all(
			roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
		);
	});

	async function logFile(): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), "rehearse-launcher-"));
		roots.push(root);

		return join(root, "launches", "launch.log");
	}

	it("writes the child's output and errors to the log file", async () => {
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
	});

	it("starts the child in a session of its own, so a signal to the server's group misses it", async () => {
		const launcher = processLauncher(["sleep"], {});

		const pid = await launcher.launch(["5"], await logFile());
		pids.push(pid);

		expect(await processGroup(pid)).toBe(pid);
		expect(await processGroup(process.pid)).not.toBe(pid);
	});

	it("passes the environment it was given to the child", async () => {
		const log = await logFile();
		const launcher = processLauncher(
			["sh", "-c", 'echo "value=$LAUNCH_PROBE"'],
			{ LAUNCH_PROBE: "seen" },
		);

		pids.push(await launcher.launch([], log));

		expect(
			await eventually(async () => {
				const text = await logText(log);

				return text.includes("value=seen");
			}),
		).toBe(true);
	});
});
