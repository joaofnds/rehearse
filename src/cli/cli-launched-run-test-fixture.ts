import { join } from "node:path";

import { benchmarkRunsDirectory } from "#benchmark/run-layout";
import { storeSpendCeiling } from "#benchmark/settings";
import type { CliTestWorkspace } from "#cli/cli-test-support";
import type { Launcher } from "#server/launches";
import processLauncher from "#server/process-launcher";

import {
	SIGNALS_LOG,
	eventually,
	terminate,
} from "./cli-confinement-test-fixture";
import type { PipelineFixture } from "./cli-pipeline-test-fixture";
import {
	FREE_PROVIDER_CALL_COST_USD,
	TEST_SPEND_CEILING_USD,
	controlCopy,
	passingTarget,
} from "./cli-pipeline-test-fixture";
import { environmentWithoutRecordsLocation } from "./cli-process-test-driver";
import { providerShim } from "./cli-provider-test-fixture";

const RESOURCE_DRAIN_START_INDEX = 0;

class ProcessGroups {
	readonly #leaders: number[] = [];
	public track(pid: number): void {
		this.#leaders.push(pid);
	}
	public cleanUp(): void {
		for (const leader of this.#leaders.splice(RESOURCE_DRAIN_START_INDEX)) {
			try {
				process.kill(-leader, "SIGKILL");
			} catch {
				// The stopped run already ended this process group.
			}
		}
	}
}

interface BlockedRunContext {
	readonly workspace: Readonly<CliTestWorkspace>;
	readonly outsidePid: number;
	readonly processGroups: Readonly<ProcessGroups>;
}
interface BlockedRun {
	readonly directory: string;
	readonly control: string;
	readonly launcher: Launcher;
	readonly pid: number;
	readonly session: number;
	readonly launchedAt: string | undefined;
}
interface BlockedRunInputs extends PipelineFixture {
	readonly directory: string;
}
function blockingStageCall(directory: string, outsidePid: number): string[] {
	const log = join(directory, SIGNALS_LOG);
	const pidFile = join(directory, "session.pid");
	return [
		'case " $* " in *" --dangerously-skip-permissions "*)',
		`\t${terminate(String(outsidePid), "outside", log)}`,
		`\techo $$ > '${pidFile}.partial'; mv '${pidFile}.partial' '${pidFile}'`,
		"\texec sleep 300 ;;",
		"esac",
	];
}
async function blockedRunInputs(
	workspace: Readonly<CliTestWorkspace>,
	outsidePid: number,
): Promise<BlockedRunInputs> {
	const directory = await workspace.createDirectory("rehearse-confined-");
	const [control, binDirectory, target] = await Promise.all([
		controlCopy(directory),
		providerShim({
			callCostUsd: FREE_PROVIDER_CALL_COST_USD,
			directory,
			onCall: blockingStageCall(directory, outsidePid),
		}),
		passingTarget(directory),
	]);
	await storeSpendCeiling(
		benchmarkRunsDirectory(control),
		TEST_SPEND_CEILING_USD,
	);
	return { binDirectory, control, directory, target };
}
async function launchedSessionPid(directory: string): Promise<number> {
	const sessionPidPath = join(directory, "session.pid");
	await eventually(async () => await Bun.file(sessionPidPath).exists());
	const sessionPidText = await Bun.file(sessionPidPath).text();
	return Number(sessionPidText.trim());
}
async function blockedConfinedRun({
	workspace,
	outsidePid,
	processGroups,
}: BlockedRunContext): Promise<BlockedRun> {
	const { directory, control, binDirectory, target } = await blockedRunInputs(
		workspace,
		outsidePid,
	);
	const launcher = processLauncher(
		[process.execPath, join(control, "rehearse.ts")],
		{
			...environmentWithoutRecordsLocation(),
			PATH: `${binDirectory}:${Bun.env["PATH"] ?? ""}`,
		},
	);
	const pid = await launcher.launch(
		["run", "--case", "audit-log", "--model", "sonnet", "--target", target],
		join(directory, "launch.log"),
	);
	processGroups.track(pid);
	const launchedAt = await launcher.startedAt(pid);
	const session = await launchedSessionPid(directory);
	processGroups.track(session);
	return { control, directory, launchedAt, launcher, pid, session };
}

export { ProcessGroups, blockedConfinedRun as default };
