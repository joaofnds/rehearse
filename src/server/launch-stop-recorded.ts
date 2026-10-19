import { writeLaunchRecord } from "#benchmark/launch-record";
import type { LaunchRecord } from "#benchmark/launch-record";
import { LaunchRefusalError } from "#server/launch-refusal";
import type { LaunchDependencies } from "#server/launches-contract";
import runningLaunch from "#server/launches-running-launch";

async function stoppingRecord(
	id: string,
	dependencies: LaunchDependencies,
): Promise<LaunchRecord | LaunchRefusalError> {
	try {
		return await runningLaunch(id, dependencies);
	} catch (error) {
		if (!(error instanceof LaunchRefusalError)) {
			throw error;
		}

		return error;
	}
}

async function stopRecordedLaunch(
	id: string,
	dependencies: LaunchDependencies,
): Promise<LaunchRecord | LaunchRefusalError> {
	const record = await stoppingRecord(id, dependencies);
	if (record instanceof LaunchRefusalError) {
		return record;
	}

	await writeLaunchRecord(dependencies.runsDirectory, {
		...record,
		stopRequestedAt: new Date().toISOString(),
	});
	dependencies.launcher.stop(record.pid);

	return record;
}

export { stopRecordedLaunch as default };
