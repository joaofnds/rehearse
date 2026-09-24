import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

import {
	benchmarkRunPaths,
	runEventsDatabaseFile,
} from "#benchmark/run-layout";
import { openRunEventStore } from "#benchmark/run-events";
import type { RunLiveness } from "#benchmark/run-liveness";
import {
	directorySource,
	FINAL_JUDGE_FAILURE,
	nothingRunning,
	RecordedRunsFixture,
	STOPPED_RUN_ERROR,
} from "#benchmark/run-records-test-support";
import { createApiApp } from "./api";
import {
	GROUP_COST_REASON,
	NO_MANIFEST_REASON,
	NOT_RUN_REASON,
	REPLAY_TASK_GRADE_REASON,
	REPLAY_WALL_TIME_REASON,
	SESSION_COST_REASON,
} from "./run-history";
import {
	INTERRUPTED_REASON,
	PRODUCT_OWNER_COST_REASON,
	RUN_FAILED_REASON,
	STOPPED_GRADE_REASON,
	WALL_TIME_REASON,
} from "./run-record";

/**
 * Only the fields a test finds a row by: the rest of the row is what each
 * test asserts, against the served JSON as it arrived.
 */
const runHistorySchema = z.object({
	rows: z.array(
		z.looseObject({
			kind: z.string(),
			run: z.string().optional(),
		}),
	),
});

/** A session attempt record, read loosely so a test can drop one field. */
const sessionRecordSchema = z.looseObject({ metrics: z.unknown() });

type ListedRow = z.infer<typeof runHistorySchema>["rows"][number];

const liveRun: RunLiveness = {
	readMarker: () => Promise.resolve({ pid: 1 }),
	isAlive: () => true,
};

const FINISHED_RUN = "2026-09-11T00-00-00.000Z";

/**
 * The event reconciliation appends for a run no live process holds. Run
 * history lists a run whose last event is not terminal only while it runs,
 * so a run that died awaiting judgment is listed once this is recorded.
 */
async function reconciledAsInterrupted(
	fixture: RecordedRunsFixture,
	run: string,
	stage = "build",
): Promise<void> {
	const store = await openRunEventStore(
		runEventsDatabaseFile(fixture.runsDirectory),
	);
	store.append({
		runId: run,
		kind: "run-interrupted",
		stage,
		spentUsd: 1,
		elapsedMs: 5000,
	});
	store.close();
}

interface TaskGradeCase {
	readonly outcome: string;
	readonly write: (fixture: RecordedRunsFixture) => Promise<void>;
	readonly run: (fixture: RecordedRunsFixture) => string;
	readonly liveness: RunLiveness;
	readonly taskGrade: Record<string, string>;
}

const TASK_GRADES: readonly TaskGradeCase[] = [
	{
		outcome: "the final judge's PASS",
		write: (fixture) => fixture.writePipelineRun(FINISHED_RUN, "audit-log"),
		run: () => FINISHED_RUN,
		liveness: nothingRunning,
		taskGrade: { state: "available", status: "JUDGED", verdict: "PASS" },
	},
	{
		outcome: "the final judge's FAIL",
		write: (fixture) => fixture.writeFailedVerdictRun(FINISHED_RUN),
		run: () => FINISHED_RUN,
		liveness: nothingRunning,
		taskGrade: { state: "available", status: "JUDGED", verdict: "FAIL" },
	},
	{
		outcome: "judging failed with its reason",
		write: (fixture) => fixture.writeFinalJudgeFailedRun(FINISHED_RUN),
		run: () => FINISHED_RUN,
		liveness: nothingRunning,
		taskGrade: {
			state: "available",
			status: "JUDGING_FAILED",
			reason: FINAL_JUDGE_FAILURE,
		},
	},
	{
		outcome: "pending while the run executes",
		write: (fixture) => fixture.writeRunningRun(),
		run: (fixture) => fixture.runningRun,
		liveness: liveRun,
		taskGrade: { state: "available", status: "PENDING", stage: "build" },
	},
	{
		outcome: "not gradable at the stage a stopped run ended in",
		write: (fixture) => fixture.writeStoppedRun(),
		run: (fixture) => fixture.stoppedRun,
		liveness: nothingRunning,
		taskGrade: {
			state: "available",
			status: "NOT_REACHED",
			stage: "build",
			reason: STOPPED_RUN_ERROR,
		},
	},
	{
		outcome: "not gradable at the stage an interrupted run ended in",
		write: (fixture) => fixture.writeInterruptedRun(),
		run: (fixture) => fixture.interruptedRun,
		liveness: nothingRunning,
		taskGrade: {
			state: "available",
			status: "NOT_REACHED",
			stage: "build",
			reason: INTERRUPTED_REASON,
		},
	},
	{
		outcome: "not gradable at the stage an aborted run ended in",
		write: (fixture) => fixture.writeSignalAbortedRun(),
		run: (fixture) => fixture.abortedRun,
		liveness: nothingRunning,
		taskGrade: {
			state: "available",
			status: "NOT_REACHED",
			stage: "build",
			reason: RUN_FAILED_REASON,
		},
	},
	{
		outcome: "not gradable at the stage a run died awaiting judgment in",
		write: async (fixture) => {
			await fixture.writeAwaitingJudgeRun();
			await reconciledAsInterrupted(fixture, fixture.awaitingJudgeRun);
		},
		run: (fixture) => fixture.awaitingJudgeRun,
		liveness: nothingRunning,
		taskGrade: {
			state: "available",
			status: "NOT_REACHED",
			stage: "build",
			reason: INTERRUPTED_REASON,
		},
	},
];

describe("/api/runs", () => {
	const roots: string[] = [];

	afterEach(async () => {
		await Promise.all(
			roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
		);
	});

	async function emptyFixture(): Promise<RecordedRunsFixture> {
		const root = await mkdtemp(join(tmpdir(), "rehearse-run-figures-"));
		roots.push(root);

		return new RecordedRunsFixture(root);
	}

	async function rows(
		fixture: RecordedRunsFixture,
		liveness: RunLiveness = nothingRunning,
	): Promise<readonly ListedRow[]> {
		const app = createApiApp({
			runsDirectory: fixture.runsDirectory,
			liveness,
			corpusSource: directorySource(fixture.runsDirectory),
		});

		const response = await app.request("/api/runs");

		return runHistorySchema.parse(await response.json()).rows;
	}

	async function runRow(
		fixture: RecordedRunsFixture,
		run: string,
		liveness: RunLiveness = nothingRunning,
	): Promise<ListedRow | undefined> {
		const listed = await rows(fixture, liveness);

		return listed.find((row) => row.kind === "run" && row.run === run);
	}

	async function onlyRowOfKind(
		fixture: RecordedRunsFixture,
		kind: string,
	): Promise<ListedRow | undefined> {
		const listed = await rows(fixture);

		return listed.find((row) => row.kind === kind);
	}

	describe("GET", () => {
		describe("a pipeline run row", () => {
			it("carries one step grade per stage in pipeline order, marking a stopped stage's grade as not recorded", async () => {
				const fixture = await emptyFixture();
				await fixture.writeStoppedRun();

				const row = await runRow(fixture, fixture.stoppedRun);

				expect(row).toMatchObject({
					stepGrades: {
						state: "available",
						grades: [
							{
								stage: "discuss",
								status: "graded",
								grade: { state: "available", letter: "A" },
							},
							{
								stage: "build",
								status: "stopped",
								grade: {
									state: "unavailable",
									reasons: [STOPPED_GRADE_REASON],
								},
							},
						],
					},
				});
			});

			it("marks each stage after the one a live run is in as not run", async () => {
				const fixture = await emptyFixture();
				await fixture.writeRunningRun("turn-completed", "discuss");

				const row = await runRow(fixture, fixture.runningRun, liveRun);

				expect(row).toMatchObject({
					stepGrades: {
						state: "available",
						grades: [
							{ stage: "discuss", status: "no-record" },
							{
								stage: "build",
								status: "not-run",
								grade: { state: "unavailable", reasons: [NOT_RUN_REASON] },
							},
						],
					},
				});
			});

			it("keeps its figures when the short id registry cannot be read", async () => {
				const fixture = await emptyFixture();
				await fixture.writeStoppedRun();
				await mkdir(
					join(fixture.runsDirectory, "short-ids", "audit-log", "claims", "99"),
					{ recursive: true },
				);

				const row = await runRow(fixture, fixture.stoppedRun);

				expect(row).toMatchObject({
					stepGrades: { state: "available" },
					taskGrade: { state: "available", status: "NOT_REACHED" },
				});
			});

			it("marks each stage after the one an interrupted run ended in as not run", async () => {
				const fixture = await emptyFixture();
				await fixture.writeRunningRun("turn-completed", "discuss");
				await reconciledAsInterrupted(fixture, fixture.runningRun, "discuss");

				const row = await runRow(fixture, fixture.runningRun);

				expect(row).toMatchObject({
					stepGrades: {
						state: "available",
						grades: [
							{ stage: "discuss", status: "no-record" },
							{ stage: "build", status: "not-run" },
						],
					},
				});
			});

			it("keeps a stage before the one an interrupted run ended in as no-record", async () => {
				const fixture = await emptyFixture();
				await fixture.writeInterruptedRun();

				const row = await runRow(fixture, fixture.interruptedRun);

				expect(row).toMatchObject({
					stepGrades: {
						state: "available",
						grades: [
							{ stage: "discuss", status: "no-record" },
							{ stage: "build", status: "no-record" },
						],
					},
				});
			});

			it("keeps a stage that saved a checkpoint without a record as no-record", async () => {
				const fixture = await emptyFixture();
				await fixture.write();

				const row = await runRow(fixture, fixture.replayableRun);

				expect(row).toMatchObject({
					stepGrades: {
						state: "available",
						grades: [
							{ stage: "discuss", status: "no-record" },
							{ stage: "build", status: "no-record" },
						],
					},
				});
			});

			it.each(TASK_GRADES.map((row) => [row.outcome, row]))(
				"carries the task grade as %s",
				async (_outcome, { write, run, liveness, taskGrade }) => {
					const fixture = await emptyFixture();
					await write(fixture);

					const row = await runRow(fixture, run(fixture), liveness);

					expect(row).toMatchObject({ taskGrade });
				},
			);

			it("carries the run's cost summed over the parts it names, naming the part it lacks", async () => {
				const fixture = await emptyFixture();
				await fixture.writeStoppedRunEvidence();

				const row = await runRow(fixture, fixture.stoppedRun);

				expect(row).toMatchObject({
					cost: {
						state: "available",
						usd: 2 + 1 + 3 + 0.5,
						parts: [
							{ part: "discuss session", usd: 2 },
							{ part: "discuss judge", usd: 1 },
							{ part: "build session", usd: 3 },
							{ part: "build judge", usd: 0.5 },
						],
						missing: [
							{ part: "Product Owner", reason: PRODUCT_OWNER_COST_REASON },
						],
					},
				});
			});

			it("carries the run's wall time as not recorded with its reason", async () => {
				const fixture = await emptyFixture();
				await fixture.writeStoppedRunEvidence();

				const row = await runRow(fixture, fixture.stoppedRun);

				expect(row).toMatchObject({
					wallTime: { state: "unavailable", reasons: [WALL_TIME_REASON] },
				});
			});

			describe("when the run wrote no manifest", () => {
				it("keeps the row with each figure unavailable for that reason", async () => {
					const unavailable = {
						state: "unavailable",
						reasons: [NO_MANIFEST_REASON],
					};
					const fixture = await emptyFixture();
					await fixture.writeEventsOnlyFailedRun();

					const row = await runRow(fixture, fixture.eventsOnlyRun);

					expect(row).toMatchObject({
						stepGrades: unavailable,
						taskGrade: unavailable,
						cost: unavailable,
						wallTime: unavailable,
					});
				});
			});

			describe("when a stage record does not parse", () => {
				it("keeps the row with each figure unavailable", async () => {
					const fixture = await emptyFixture();
					await fixture.writeStoppedRun();
					await Bun.write(
						benchmarkRunPaths(
							fixture.runsDirectory,
							fixture.stoppedRun,
						).stageFile("discuss"),
						JSON.stringify({ stage: "discuss", costUsd: "one dollar" }),
					);

					const row = await runRow(fixture, fixture.stoppedRun);

					expect(row).toMatchObject({
						status: "STOPPED:build",
						stepGrades: { state: "unavailable" },
						taskGrade: { state: "unavailable" },
						cost: { state: "unavailable" },
						wallTime: { state: "unavailable" },
					});
				});
			});
		});

		describe("a replay row", () => {
			async function replayRow(): Promise<ListedRow | undefined> {
				const fixture = await emptyFixture();
				await fixture.writeReplayOf(
					fixture.replayableRun,
					fixture.stageAttempt.timestamp,
				);

				return onlyRowOfKind(fixture, "replay");
			}

			it("carries its stage's grade and its cost summed over its session, Product Owner and judge", async () => {
				const row = await replayRow();

				expect(row).toMatchObject({
					grade: "A",
					cost: {
						state: "available",
						usd: 1 + 0.25 + 0.5,
						parts: [
							{ part: "build session", usd: 1 },
							{ part: "Product Owner", usd: 0.25 },
							{ part: "build judge", usd: 0.5 },
						],
						missing: [],
					},
				});
			});

			it("carries a task grade of not applicable with its reason", async () => {
				const row = await replayRow();

				expect(row).toMatchObject({
					taskGrade: {
						state: "available",
						status: "NOT_APPLICABLE",
						reason: REPLAY_TASK_GRADE_REASON,
					},
				});
			});

			it("carries its wall time as not recorded with its reason", async () => {
				const row = await replayRow();

				expect(row).toMatchObject({
					wallTime: {
						state: "unavailable",
						reasons: [REPLAY_WALL_TIME_REASON],
					},
				});
			});
		});

		describe("a session attempt row", () => {
			it("carries its recorded outcome, cost and elapsed time", async () => {
				const fixture = await emptyFixture();
				await fixture.write();

				const row = await onlyRowOfKind(fixture, "session-attempt");

				expect(row).toMatchObject({
					status: "SUCCESSFUL",
					cost: {
						state: "available",
						usd: 0.5,
						parts: [{ part: "session", usd: 0.5 }],
						missing: [],
					},
					wallTime: { state: "available", ms: 1000 },
				});
			});

			it("carries its cost as not recorded when the attempt kept no call metrics", async () => {
				const fixture = await emptyFixture();
				await fixture.write();
				const file = Bun.file(fixture.sessionAttemptFile);
				const { metrics: _dropped, ...withoutMetrics } =
					sessionRecordSchema.parse(await file.json());
				await Bun.write(file, JSON.stringify(withoutMetrics));

				const row = await onlyRowOfKind(fixture, "session-attempt");

				expect(row).toMatchObject({
					cost: { state: "unavailable", reasons: [SESSION_COST_REASON] },
				});
			});
		});

		describe("a confirmation group row", () => {
			it("carries its makespan as its wall time and its cost as not recorded", async () => {
				const fixture = await emptyFixture();
				await fixture.write();

				const row = await onlyRowOfKind(fixture, "group");

				expect(row).toMatchObject({
					cost: { state: "unavailable", reasons: [GROUP_COST_REASON] },
					wallTime: { state: "available", ms: 200 },
				});
			});
		});
	});
});
