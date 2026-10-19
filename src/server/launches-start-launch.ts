import { randomUUID } from "node:crypto";

import { writeLaunchRecord } from "#benchmark/launch-record";
import type { LaunchRecord, LaunchTarget } from "#benchmark/launch-record";
import { launchPaths } from "#benchmark/run-layout";
import planLaunch from "#server/launch-plan";
import type {
	LaunchDependencies,
	LaunchRequest,
} from "#server/launches-contract";

interface LaunchIdentity {
	readonly id: string;
	readonly launchedAt: string;
}

interface LaunchedProcess {
	readonly pid: number;
	readonly startedAt: string | undefined;
}

async function startLaunch(
	request: LaunchRequest,
	dependencies: LaunchDependencies,
): Promise<string> {
	const launch = await planLaunch(request, dependencies);
	const id = randomUUID();
	// Read before the spawn: run history gives a run its launch's Stop only when
	// the launch is dated no later than the run's claim on its target.
	const launchedAt = dependencies.now().toISOString();
	const pid = await dependencies.launcher.launch(
		launch.argv,
		launchPaths(dependencies.runsDirectory, id).logFile,
	);
	try {
		const startedAt = await dependencies.launcher.startedAt(pid);
		await writeLaunchRecord(
			dependencies.runsDirectory,
			launchRecord(launch.target, { id, launchedAt }, { pid, startedAt }),
		);
	} catch (error) {
		dependencies.launcher.stop(pid);
		throw error;
	}

	return id;
}

function launchRecord(
	target: LaunchTarget,
	launch: LaunchIdentity,
	process: LaunchedProcess,
): LaunchRecord {
	return {
		...target,
		id: launch.id,
		launchedAt: launch.launchedAt,
		pid: process.pid,
		startedAt: process.startedAt,
	};
}

export { startLaunch as default };
