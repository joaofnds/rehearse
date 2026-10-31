import { describe, expect, it } from "bun:test";

import { resources } from "#benchmark/session-attempt-workspace-test-fixtures";

import SessionCommandLifetime from "./session-command-lifetime";
import MidRunStop from "./session-command-stop-test-fixture";

resources.registerCleanup();

const NO_PROVIDER_RUNS = 0;

describe(SessionCommandLifetime.name, () => {
	describe("when the operator stops attempts mid-run", () => {
		it("never starts the provider command of an attempt still preparing", async () => {
			const { preparingProviderRuns } = await MidRunStop.afterStop();

			expect(preparingProviderRuns).toBe(NO_PROVIDER_RUNS);
		});

		it("refuses every command started after the stop", async () => {
			const { commandAfterStop } = await MidRunStop.afterStop();

			expect(commandAfterStop).toBe("refused");
		});

		it("keeps each killed attempt's full transcript in its record", async () => {
			const { recordedTranscripts, writtenTranscripts } =
				await MidRunStop.afterStop();

			expect(recordedTranscripts).toEqual(writtenTranscripts);
		});

		it("leaves no project slug behind", async () => {
			const { projectEntries } = await MidRunStop.afterStop();

			expect(projectEntries).toEqual([]);
		});

		it("leaves no attempt directory behind", async () => {
			const { attemptDirectoriesLeft } = await MidRunStop.afterStop();

			expect(attemptDirectoriesLeft).toEqual([false, false]);
		});
	});
});
