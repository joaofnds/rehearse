import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RunLiveness } from "#benchmark/run-liveness";
import {
	directorySource,
	FINAL_JUDGE_FAILURE,
	nothingRunning,
	RecordedRunsFixture,
} from "#benchmark/run-records-test-support";
import { createApiApp } from "./api";
import {
	AWAITING_JUDGMENT_REASON,
	INTERRUPTED_REASON,
	RUN_FAILED_REASON,
	UNEXPLAINED_END_REASON,
} from "./run-record";

const FINISHED_RUN = "2026-09-11T00-00-00.000Z";

const liveRun: RunLiveness = {
	readMarker: () => Promise.resolve({ pid: 1 }),
	isAlive: () => true,
};

interface EndedRun {
	readonly ending: string;
	readonly write: (fixture: RecordedRunsFixture) => Promise<void>;
	readonly run: (fixture: RecordedRunsFixture) => string;
	readonly reason: string;
}

const RUNS_ENDED_BEFORE_THE_FINAL_JUDGE: readonly EndedRun[] = [
	{
		ending: "a stopped run",
		write: (fixture) => fixture.writeStoppedRun(),
		run: (fixture) => fixture.stoppedRun,
		reason: "build stage graded F; minimum grade is B",
	},
	{
		ending: "an interrupted run",
		write: (fixture) => fixture.writeInterruptedRun(),
		run: (fixture) => fixture.interruptedRun,
		reason: INTERRUPTED_REASON,
	},
	{
		ending: "an aborted run",
		write: (fixture) => fixture.writeSignalAbortedRun(),
		run: (fixture) => fixture.abortedRun,
		reason: RUN_FAILED_REASON,
	},
	{
		ending: "a run that died awaiting judgment",
		write: (fixture) => fixture.writeAwaitingJudgeRun(),
		run: (fixture) => fixture.awaitingJudgeRun,
		reason: AWAITING_JUDGMENT_REASON,
	},
];

describe("/api/runs/:run", () => {
	const roots: string[] = [];

	afterEach(async () => {
		await Promise.all(
			roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
		);
	});

	async function emptyFixture(): Promise<RecordedRunsFixture> {
		const root = await mkdtemp(join(tmpdir(), "rehearse-run-record-"));
		roots.push(root);

		return new RecordedRunsFixture(root);
	}

	async function runRecord(
		fixture: RecordedRunsFixture,
		run: string,
		liveness: RunLiveness = nothingRunning,
	): Promise<Response> {
		const app = createApiApp({
			runsDirectory: fixture.runsDirectory,
			liveness,
			corpusSource: directorySource(fixture.runsDirectory),
		});

		const response = await app.request(`/api/runs/${encodeURIComponent(run)}`);

		return response;
	}

	describe("GET", () => {
		it("reports each stage's session and judge cost as its stage file records them", async () => {
			const fixture = await emptyFixture();
			await fixture.writeStoppedRunEvidence();

			const response = await runRecord(fixture, fixture.stoppedRun);

			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				stages: [
					{
						stage: "discuss",
						sessionCost: { state: "available", usd: 2 },
						judgeCost: { state: "available", usd: 1 },
					},
					{
						stage: "build",
						sessionCost: { state: "available", usd: 3 },
						judgeCost: { state: "available", usd: 0.5 },
					},
				],
			});
		});

		describe("the final outcome", () => {
			it("reports the final judge's PASS on a finished run", async () => {
				const fixture = await emptyFixture();
				await fixture.writePipelineRun(FINISHED_RUN, "audit-log");

				const response = await runRecord(fixture, FINISHED_RUN);

				expect(await response.json()).toMatchObject({
					finalOutcome: { status: "JUDGED", verdict: "PASS" },
				});
			});

			it("reports the final judge's FAIL on a finished run", async () => {
				const fixture = await emptyFixture();
				await fixture.writeFailedVerdictRun(FINISHED_RUN);

				const response = await runRecord(fixture, FINISHED_RUN);

				expect(await response.json()).toMatchObject({
					finalOutcome: { status: "JUDGED", verdict: "FAIL" },
				});
			});

			it("reports judging failed with the failure the artifact records", async () => {
				const fixture = await emptyFixture();
				await fixture.writeFinalJudgeFailedRun(FINISHED_RUN);

				const response = await runRecord(fixture, FINISHED_RUN);

				expect(await response.json()).toMatchObject({
					finalOutcome: {
						status: "JUDGING_FAILED",
						reason: FINAL_JUDGE_FAILURE,
					},
				});
			});

			it("reports pending while the run is still executing", async () => {
				const fixture = await emptyFixture();
				await fixture.writeRunningRun();

				const response = await runRecord(fixture, fixture.runningRun, liveRun);

				expect(await response.json()).toMatchObject({
					finalOutcome: { status: "PENDING" },
				});
			});

			it("reports a run that recorded neither a stage nor an event as not reached for an unrecorded reason", async () => {
				const fixture = await emptyFixture();
				await fixture.writeNoRecordRun();

				const response = await runRecord(fixture, fixture.noRecordRun);

				expect(await response.json()).toMatchObject({
					finalOutcome: {
						status: "NOT_REACHED",
						reason: UNEXPLAINED_END_REASON,
					},
				});
			});

			describe("when the run ended before the final judge", () => {
				it.each(
					RUNS_ENDED_BEFORE_THE_FINAL_JUDGE.map((row) => [row.ending, row]),
				)(
					"reports %s as not reached at the stage it ended in",
					async (_ending, { write, run, reason }) => {
						const fixture = await emptyFixture();
						await write(fixture);

						const response = await runRecord(fixture, run(fixture));

						expect(await response.json()).toMatchObject({
							finalOutcome: { status: "NOT_REACHED", stage: "build", reason },
						});
					},
				);
			});
		});
	});
});
