import { describe, expect, it, setDefaultTimeout } from "bun:test";
import { join } from "node:path";

import { RECORDS_DIRECTORY_VARIABLE } from "#benchmark/config";
import { writeLaunchRecord } from "#benchmark/launch-record";
import { liveRunLiveness } from "#benchmark/run-liveness";
import { PROJECT_ROOT } from "#benchmark/test-support";
import { CliTestWorkspace } from "#cli/cli-test-support";
import { LAUNCH_OPTION } from "#cli/launch-option";
import processLauncher from "#server/process-launcher";
import { runListing } from "#server/run-history";

import { eventually, isRunning } from "./cli-confinement-test-fixture";
import {
	CLI_TEST_TIMEOUT_MS,
	environmentWithoutKnobs,
} from "./cli-process-test-driver";
import { providerShim } from "./cli-provider-test-fixture";

const workspace = CliTestWorkspace.forEachTest();

setDefaultTimeout(CLI_TEST_TIMEOUT_MS);

const LAUNCH_ID = "8a1c0000-0000-4000-8000-000000000358";

const SPEND_CEILING_REFUSAL =
	"No spend ceiling is stored, and nothing spends without one. Set it with: rehearse settings --spend-ceiling-usd <USD>";

/** A provider call would mean the refusal came too late, so the shim fails it. */
const FAILING_PROVIDER_CALL = [
	"echo 'no provider call expected' >&2",
	"exit 1",
];

describe("a browser launch the CLI refuses", () => {
	it("lists as ENDED with the refusal once its confined command exits", async () => {
		const directory = await workspace.createDirectory(
			"rehearse-refused-launch-",
		);
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
				LAUNCH_ID,
				"run",
				"--case",
				"audit-log",
				"--model",
				"sonnet",
				"--target",
				join(directory, "target"),
			],
			join(records, "launches", `${LAUNCH_ID}.log`),
		);
		await writeLaunchRecord(records, {
			attempts: 1,
			caseId: "audit-log",
			id: LAUNCH_ID,
			kind: "case",
			launchedAt: new Date().toISOString(),
			pid,
		});

		await eventually(async () => await Promise.resolve(!isRunning(pid)));

		const { launches } = await runListing(records, liveRunLiveness());
		expect(launches).toMatchObject([
			{
				ending: { exitCode: 3, message: SPEND_CEILING_REFUSAL },
				id: LAUNCH_ID,
				status: "ENDED",
			},
		]);
	});
});
