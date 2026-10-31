import { join } from "node:path";

import { RECORDS_DIRECTORY_VARIABLE } from "#benchmark/config";
import { writeLaunchRecord } from "#benchmark/launch-record";
import { PROJECT_ROOT } from "#benchmark/test-support";
import type { CliTestWorkspace } from "#cli/cli-test-support";
import { LAUNCH_OPTION } from "#cli/launch-option";
import processLauncher from "#server/process-launcher";

import { environmentWithoutKnobs } from "./cli-process-test-driver";
import { providerShim } from "./cli-provider-test-fixture";

const REFUSED_LAUNCH_ID = "8a1c0000-0000-4000-8000-000000000358";

/** A provider call would mean the refusal came too late, so the shim fails it. */
const FAILING_PROVIDER_CALL = [
	"echo 'no provider call expected' >&2",
	"exit 1",
];

interface RefusedLaunch {
	readonly records: string;
	readonly pid: number;
}

/**
 * A browser launch of the audit-log pipeline case into records that hold no
 * spend ceiling, through the real process launcher and CLI, so the command
 * refuses after confinement re-executes it and before any provider call.
 */
async function refusedLaunch(
	workspace: Readonly<CliTestWorkspace>,
): Promise<RefusedLaunch> {
	const directory = await workspace.createDirectory("rehearse-refused-launch-");
	const records = join(directory, "records");
	const binDirectory = await providerShim({
		directory,
		onCall: FAILING_PROVIDER_CALL,
	});
	const launcher = processLauncher(
		[process.execPath, join(PROJECT_ROOT, "rehearse.ts")],
		{
			...environmentWithoutKnobs(),
			PATH: `${binDirectory}:${Bun.env["PATH"] ?? ""}`,
			[RECORDS_DIRECTORY_VARIABLE]: records,
		},
	);

	const pid = await launcher.launch(
		[
			LAUNCH_OPTION,
			REFUSED_LAUNCH_ID,
			"run",
			"--case",
			"audit-log",
			"--model",
			"sonnet",
			"--target",
			join(directory, "target"),
		],
		join(records, "launches", `${REFUSED_LAUNCH_ID}.log`),
	);
	await writeLaunchRecord(records, {
		attempts: 1,
		caseId: "audit-log",
		id: REFUSED_LAUNCH_ID,
		kind: "case",
		launchedAt: new Date().toISOString(),
		pid,
	});

	return { pid, records };
}

export { REFUSED_LAUNCH_ID, refusedLaunch };
