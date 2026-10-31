import { describe, expect, it, setDefaultTimeout } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { RECORDS_DIRECTORY_VARIABLE } from "#benchmark/config";
import { readLaunchEnding } from "#benchmark/launch-ending";
import { TestResources } from "#benchmark/test-support";

import {
	CLI_TEST_TIMEOUT_MS,
	environmentWithoutKnobs,
	runCli,
} from "./cli-process-test-driver";

setDefaultTimeout(CLI_TEST_TIMEOUT_MS);

const LAUNCH_ID = "8a1c0000-0000-4000-8000-000000000355";

const REFUSED_PRECONDITION_EXIT_CODE = 3;

const REFUSAL = "No replayable run named nope; recorded runs: none";

const REFUSED_REPLAY = ["replay", "--run", "nope", "--stage", "build"];

const testResources = TestResources.forEachTest();

async function recordsRoot(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-launch-ending-"));
	testResources.track(root);

	return root;
}

async function launchedCli(
	records: string,
	args: readonly string[],
): ReturnType<typeof runCli> {
	return await runCli(["--launch", LAUNCH_ID, ...args], "empty", {
		...environmentWithoutKnobs(),
		[RECORDS_DIRECTORY_VARIABLE]: records,
	});
}

describe("rehearse --launch", () => {
	it("records the refusal a launched command ended by", async () => {
		const records = await recordsRoot();

		await launchedCli(records, REFUSED_REPLAY);

		expect(await readLaunchEnding(records, LAUNCH_ID)).toMatchObject({
			exitCode: REFUSED_PRECONDITION_EXIT_CODE,
			message: REFUSAL,
		});
	});

	it("still reports the refusal and its exit code", async () => {
		const records = await recordsRoot();

		const result = await launchedCli(records, REFUSED_REPLAY);

		expect(result).toMatchObject({
			exitCode: REFUSED_PRECONDITION_EXIT_CODE,
			stderr: `${REFUSAL}\n`,
		});
	});

	it("records no ending for a command that completes", async () => {
		const records = await recordsRoot();

		await launchedCli(records, ["replay", "--help"]);

		expect(await readLaunchEnding(records, LAUNCH_ID)).toBeUndefined();
	});

	describe("when the ending cannot be written", () => {
		it("ends with the refusal and its exit code", async () => {
			const records = join(await recordsRoot(), "a-file");
			await Bun.write(records, "");

			const result = await launchedCli(records, REFUSED_REPLAY);

			expect(result.exitCode).toBe(REFUSED_PRECONDITION_EXIT_CODE);
			expect(result.stderr).toStartWith(
				`${REFUSAL}\nThe launch's ending was not recorded: `,
			);
		});
	});
});
