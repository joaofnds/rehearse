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

	it("drops every knob a case declares, so a launch runs the case as declared", async () => {
		const log = await logFile();
		const launcher = processLauncher(["sh", "-c", "env"], {
			KEPT: "yes",
			BENCHMARK_LIVE_CORPUS_BACKING_ROOT: "/backing",
			BENCHMARK_CASE: "other",
			BENCHMARK_EFFORT: "max",
			BENCHMARK_JUDGE_EFFORT: "max",
			BENCHMARK_JUDGE_MODEL: "opus",
			BENCHMARK_MINIMUM_GRADE: "A",
			BENCHMARK_MODEL: "opus",
			BENCHMARK_PIPELINE: "other",
			BENCHMARK_SESSION_BUDGET_USD: "50",
			BENCHMARK_TARGET_DIR: "/some/other/repo",
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
	});

	it("reports when the process holding a pid started", async () => {
		const launcher = processLauncher(["sleep"], {});
		const pid = await launcher.launch(["5"], await logFile());
		pids.push(pid);

		const startedAt = await launcher.startedAt(pid);

		const table = await Bun.$`ps -o lstart= -p ${pid}`.text();
		expect(startedAt).toBe(table.trim());
	});

	it("reports no start time for a pid no process holds", async () => {
		const launcher = processLauncher(["true"], {});
		const pid = await launcher.launch([], await logFile());
		await eventually(async () => (await launcher.startedAt(pid)) === undefined);

		expect(await launcher.startedAt(pid)).toBeUndefined();
	});

	it("ends a process it is told to stop", async () => {
		const launcher = processLauncher(["sleep"], {});
		const pid = await launcher.launch(["5"], await logFile());
		pids.push(pid);

		launcher.stop(pid);

		expect(
			await eventually(
				async () => (await launcher.startedAt(pid)) === undefined,
			),
		).toBe(true);
	});
});
