import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import { benchmarkRunPaths } from "#benchmark/run-layout";
import type { RunLiveness } from "#benchmark/run-liveness";
import { RUNNING_RUN, claimBy } from "#benchmark/run-records-test-support";
import {
	RUN_OWNER_PID,
	claimLiveness,
	listedAs,
	runEndingSchema,
} from "#server/run-ending-test-fixture";
import { CLAIM_ENDINGS } from "#server/run-record-claim-ending-cases";
import RECORDED_ENDINGS from "#server/run-record-terminal-ending-cases";
import {
	clearRunRecordRoots,
	emptyFixture,
	runRecord,
} from "#server/run-record-workspace-test-fixture";

import { UNREADABLE_ENDING_REASON } from "./run-record";

const UNREADABLE_ENDING_FILES = [
	["paused.json", "pausedFile"],
	["operator-stop.json", "operatorStopFile"],
] as const;

afterEach(clearRunRecordRoots);

describe("run record endings", () => {
	it.each(
		[...RECORDED_ENDINGS, ...CLAIM_ENDINGS].map((row) => [row.ending, row]),
	)(
		"serves %s with the status run history lists and the final outcome of the same ending",
		async (_ending, { write, claim, status, finalOutcome }) => {
			const fixture = await emptyFixture();
			const run = await write(fixture);

			const response = await runRecord(fixture, run, claimLiveness(run, claim));

			expect(runEndingSchema.parse(await response.json())).toEqual({
				finalOutcome,
				status,
			});
		},
	);

	it(
		"names one ending in both readings while the run's claim lapses between reads",
		verifyNamesOneEndingInBothReadingsWhileTheRun,
	);

	it.each(UNREADABLE_ENDING_FILES)(
		"serves a run whose %s cannot be parsed with both readings saying the ending is unreadable",
		async (_file, recordFile) => {
			const fixture = await emptyFixture();
			await fixture.events.writeSignalAbortedRun();
			await Bun.write(
				benchmarkRunPaths(fixture.runsDirectory, fixture.abortedRun)[
					recordFile
				],
				"{",
			);

			const response = await runRecord(fixture, fixture.abortedRun);

			expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
			expect(runEndingSchema.parse(await response.json())).toMatchObject({
				finalOutcome: {
					reason: UNREADABLE_ENDING_REASON,
					status: "NOT_REACHED",
				},
				status: { state: "unavailable" },
			});
		},
	);
});

async function verifyNamesOneEndingInBothReadingsWhileTheRun(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.events.writeRunningRun();
	const answers = [claimBy(RUNNING_RUN, RUN_OWNER_PID)];
	const lapsing: RunLiveness = {
		isAlive: () => true,
		readMarker: async () => await Promise.resolve(answers.shift()),
	};

	const response = await runRecord(fixture, RUNNING_RUN, lapsing);

	expect(runEndingSchema.parse(await response.json())).toEqual({
		finalOutcome: { stage: "build", status: "PENDING" },
		status: listedAs("RUNNING"),
	});
}
