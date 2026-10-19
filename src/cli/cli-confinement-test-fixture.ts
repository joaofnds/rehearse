import { join } from "node:path";

import { RecordedArms } from "#benchmark/compare-attempts-test-support";
import { RECORDS_DIRECTORY_VARIABLE } from "#benchmark/config";
import { benchmarkRunsDirectory } from "#benchmark/run-layout";
import serialMap from "#benchmark/serial-map";
import { storeSpendCeiling } from "#benchmark/settings";
import type { CliTestWorkspace } from "#cli/cli-test-support";

import type { PipelineFixture } from "./cli-pipeline-test-fixture";
import {
	FREE_PROVIDER_CALL_COST_USD,
	TEST_SPEND_CEILING_USD,
	controlCopy,
	passingTarget,
} from "./cli-pipeline-test-fixture";
import { environmentWithoutKnobs } from "./cli-process-test-driver";
import { providerShim } from "./cli-provider-test-fixture";

const FINAL_MANAGED_TEST_PROCESS_OFFSET = -1;
const RESOURCE_DRAIN_START_INDEX = 0;

const PROCESS_EXISTENCE_PROBE_SIGNAL = 0;

/**
 * What each provider call tried to signal, one line per attempt: the process
 * the test started outside the run, and a process an earlier call of the same
 * run started. A call with no earlier process of its own starts one, so the
 * second call is the first that can try to stop it. Each attempt sends SIGTERM
 * and tells a refusal from a process already gone by kill's own message.
 */
const SIGNALS_LOG = "signals.log";

/** Every process a provider call started, so a test can stop what its run left behind. */
const STARTED_PIDS = "started.pids";

function terminate(pid: string, subject: string, log: string): string {
	return [
		`if out="$(kill -TERM ${pid} 2>&1)"; then echo ${subject}-stopped >> '${log}'`,
		`elif printf '%s' "$out" | grep -q 'not permitted'; then echo ${subject}-refused >> '${log}'`,
		`else echo ${subject}-gone >> '${log}'; fi`,
	].join("; ");
}

function signallingCall(directory: string, outsidePid: number): string[] {
	const log = join(directory, SIGNALS_LOG);
	const own = join(directory, "own.pid");

	return [
		terminate(String(outsidePid), "outside", log),
		`if [ -f '${own}' ]; then`,
		`\tpid="$(cat '${own}')"; rm '${own}'`,
		`\t${terminate('"$pid"', "own", log)}`,
		"else",
		`\tsleep 300 </dev/null >/dev/null 2>&1 & echo $! > '${own}'; echo $! >> '${join(directory, STARTED_PIDS)}'`,
		"fi",
	];
}

async function stopStartedProcesses(directory: string): Promise<void> {
	const started = Bun.file(join(directory, STARTED_PIDS));
	if (!(await started.exists())) {
		return;
	}
	const pids = await started.text();
	for (const pid of pids.trim().split("\n")) {
		try {
			process.kill(Number(pid), "SIGKILL");
		} catch (error) {
			if (
				!(error instanceof Error && "code" in error && error.code === "ESRCH")
			) {
				throw error;
			}
		}
	}
}

async function signalsIn(directory: string): Promise<readonly string[]> {
	const text = await Bun.file(join(directory, SIGNALS_LOG)).text();

	return text.trimEnd().split("\n");
}

function isRunning(pid: number): boolean {
	try {
		process.kill(pid, PROCESS_EXISTENCE_PROBE_SIGNAL);

		return true;
	} catch {
		return false;
	}
}

class ConfinementTestProcesses {
	private readonly fixtureDirectories: string[] = [];
	private readonly processes: ReturnType<typeof Bun.spawn>[] = [];

	public start(): void {
		this.processes.push(Bun.spawn(["sleep", "300"]));
	}

	public async createFixtureDirectory(
		workspace: Readonly<CliTestWorkspace>,
	): Promise<string> {
		const directory = await workspace.createDirectory("rehearse-confined-");
		this.fixtureDirectories.push(directory);

		return directory;
	}
	public async stop(): Promise<void> {
		try {
			await Promise.all(
				this.fixtureDirectories
					.splice(RESOURCE_DRAIN_START_INDEX)
					.map(async (directory) => {
						await stopStartedProcesses(directory);
					}),
			);
		} finally {
			for (const child of this.processes.splice(RESOURCE_DRAIN_START_INDEX)) {
				child.kill("SIGKILL");
			}
		}
	}

	public get pid(): number {
		const child = this.processes.at(FINAL_MANAGED_TEST_PROCESS_OFFSET);
		if (child === undefined) {
			throw new Error("The unrelated process has not started");
		}

		return child.pid;
	}
}

async function signallingFixture(
	workspace: Readonly<CliTestWorkspace>,
	processes: Readonly<ConfinementTestProcesses>,
): Promise<PipelineFixture & { directory: string }> {
	const directory = await processes.createFixtureDirectory(workspace);
	const [control, binDirectory, target] = await Promise.all([
		controlCopy(directory),
		providerShim({
			callCostUsd: FREE_PROVIDER_CALL_COST_USD,
			directory,
			onCall: signallingCall(directory, processes.pid),
		}),
		passingTarget(directory),
	]);
	await storeSpendCeiling(
		benchmarkRunsDirectory(control),
		TEST_SPEND_CEILING_USD,
	);

	return { binDirectory, control, directory, target };
}

async function signallingArms(
	workspace: Readonly<CliTestWorkspace>,
	processes: Readonly<ConfinementTestProcesses>,
): Promise<{
	readonly directory: string;
	readonly records: string;
	readonly environment: Readonly<Record<string, string>>;
	readonly arms: RecordedArms;
	readonly armA: string;
	readonly armB: string;
}> {
	const directory = await processes.createFixtureDirectory(workspace);
	const records = join(directory, "records");
	const binDirectory = await providerShim({
		callCostUsd: 0,
		directory,
		onCall: signallingCall(directory, processes.pid),
	});
	const arms = await RecordedArms.create(records, join(directory, "scratch"));
	const shared = { "CLAUDE.md": "global instructions\n" };
	const armA = await arms.recordArm("baseline", {
		...shared,
		"skills/build/SKILL.md": "build\n",
	});
	const armB = await arms.recordArm("candidate", {
		...shared,
		"skills/build/SKILL.md": "revised build\n",
	});
	await Promise.all([
		arms.readInStage(armA, "skills/build/SKILL.md"),
		arms.readInStage(armB, "skills/build/SKILL.md"),
	]);
	await storeSpendCeiling(records, TEST_SPEND_CEILING_USD);

	return {
		armA,
		armB,
		arms,
		directory,
		environment: {
			...environmentWithoutKnobs(),
			[RECORDS_DIRECTORY_VARIABLE]: records,
			PATH: `${binDirectory}:${Bun.env["PATH"] ?? ""}`,
		},
		records,
	};
}

const LAUNCHED_PROCESS_POLL_INTERVAL_MS = 20;
async function eventually(check: () => Promise<boolean>): Promise<boolean> {
	for await (const ready of serialMap(
		Array.from({ length: 1000 }).values(),
		check,
	)) {
		if (ready) {
			return true;
		}
		await Bun.sleep(LAUNCHED_PROCESS_POLL_INTERVAL_MS);
	}

	return false;
}

export {
	SIGNALS_LOG,
	ConfinementTestProcesses,
	eventually,
	isRunning,
	signallingArms,
	signallingCall,
	signallingFixture,
	signalsIn,
	stopStartedProcesses,
	terminate,
};
