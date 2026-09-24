import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCheckpointRecord } from "#benchmark/checkpoint";
import { benchmarkRunPaths, checkpointRecordFile } from "#benchmark/run-layout";
import type { RunLiveness } from "#benchmark/run-liveness";
import {
	corpusPath,
	directorySource,
	FINAL_JUDGE_FAILURE,
	nothingRunning,
	RecordedRunsFixture,
	STOPPED_RUN_EVIDENCE,
} from "#benchmark/run-records-test-support";
import { createApiApp } from "./api";
import {
	AWAITING_JUDGMENT_REASON,
	INTERRUPTED_REASON,
	PRODUCT_OWNER_COST_REASON,
	RUN_FAILED_REASON,
	STOPPED_GRADE_REASON,
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

		describe("tokens", () => {
			const {
				discussSessionMetrics,
				discussJudgeMetrics,
				buildSessionMetrics,
			} = STOPPED_RUN_EVIDENCE;
			const discussCalls = [...discussSessionMetrics, discussJudgeMetrics];

			function sum(
				calls: readonly (typeof buildSessionMetrics)[],
				field: keyof typeof buildSessionMetrics,
			): number {
				return calls.reduce((total, call) => total + Number(call[field]), 0);
			}

			it("sums a stage's session and judge calls in four categories and as total input", async () => {
				const fixture = await emptyFixture();
				await fixture.writeStoppedRunEvidence();

				const response = await runRecord(fixture, fixture.stoppedRun);

				expect(await response.json()).toMatchObject({
					stages: [
						{
							stage: "discuss",
							tokens: {
								state: "available",
								input: sum(discussCalls, "inputTokens"),
								cacheRead: sum(discussCalls, "cacheReadTokens"),
								cacheWrite: sum(discussCalls, "cacheWriteTokens"),
								output: sum(discussCalls, "outputTokens"),
								totalInput:
									sum(discussCalls, "inputTokens") +
									sum(discussCalls, "cacheReadTokens") +
									sum(discussCalls, "cacheWriteTokens"),
								missing: [],
							},
						},
						{ stage: "build" },
					],
				});
			});

			it("names the judge as the part a stop record's sum lacks", async () => {
				const fixture = await emptyFixture();
				await fixture.writeStoppedRunEvidence();

				const response = await runRecord(fixture, fixture.stoppedRun);

				expect(await response.json()).toMatchObject({
					stages: [
						{ stage: "discuss" },
						{
							stage: "build",
							tokens: {
								state: "available",
								input: buildSessionMetrics.inputTokens,
								output: buildSessionMetrics.outputTokens,
								missing: [{ part: "build judge" }],
							},
						},
					],
				});
			});

			it("names the Product Owner and the stop record's judge as the parts the run's sum lacks", async () => {
				const fixture = await emptyFixture();
				await fixture.writeStoppedRunEvidence();

				const response = await runRecord(fixture, fixture.stoppedRun);

				expect(await response.json()).toMatchObject({
					totals: {
						tokens: {
							state: "available",
							output: sum(
								[...discussCalls, buildSessionMetrics],
								"outputTokens",
							),
							missing: [{ part: "build judge" }, { part: "Product Owner" }],
						},
					},
				});
			});

			it("reports tokens as unavailable for a stage whose record holds no call metrics", async () => {
				const fixture = await emptyFixture();
				await fixture.writeAwaitingJudgeRun();

				const response = await runRecord(fixture, fixture.awaitingJudgeRun);

				expect(await response.json()).toMatchObject({
					stages: [
						{ stage: "discuss" },
						{ stage: "build", tokens: { state: "unavailable" } },
					],
				});
			});
		});

		describe("artifacts in and out", () => {
			const { taskCard, buildCommitSubjects, buildChangedPaths } =
				STOPPED_RUN_EVIDENCE;

			it("lists a stage's checkpointed instruction files and the task card it alone changed", async () => {
				const fixture = await emptyFixture();
				await fixture.writeStoppedRunEvidence();

				const response = await runRecord(fixture, fixture.stoppedRun);

				expect(await response.json()).toMatchObject({
					stages: [
						{
							stage: "discuss",
							checkpoint: "recorded",
							instructionFiles: [corpusPath("discuss")],
							artifactsOut: {
								declared: [],
								workflowState: {
									state: "available",
									changes: [{ path: taskCard, change: "modified" }],
								},
							},
						},
						{ stage: "build" },
					],
				});
			});

			it("lists a stage's declared artifact", async () => {
				const fixture = await emptyFixture();
				await fixture.writeStoppedRunEvidence();
				const checkpointFile = checkpointRecordFile(
					benchmarkRunPaths(
						fixture.runsDirectory,
						fixture.stoppedRun,
					).checkpointDirectory("discuss"),
				);
				const recorded = parseCheckpointRecord(
					await Bun.file(checkpointFile).text(),
				);
				await Bun.write(
					checkpointFile,
					JSON.stringify({
						...recorded,
						artifacts: [{ path: "PLAN.md", sha256: "6".repeat(64) }],
					}),
				);

				const response = await runRecord(fixture, fixture.stoppedRun);

				expect(await response.json()).toMatchObject({
					stages: [
						{ stage: "discuss", artifactsOut: { declared: ["PLAN.md"] } },
						{ stage: "build" },
					],
				});
			});

			it("lists a stopped stage's commits and instruction files from its stop record and says its checkpoint is missing", async () => {
				const fixture = await emptyFixture();
				await fixture.writeStoppedRunEvidence();

				const response = await runRecord(fixture, fixture.stoppedRun);

				expect(await response.json()).toMatchObject({
					stages: [
						{ stage: "discuss" },
						{
							stage: "build",
							checkpoint: "missing",
							instructionFiles: [corpusPath("build")],
							artifactsOut: {
								declared: [],
								workflowState: { state: "unavailable" },
								commitSubjects: {
									state: "available",
									subjects: buildCommitSubjects,
								},
								changedPaths: {
									state: "available",
									paths: buildChangedPaths,
								},
							},
						},
					],
				});
			});
		});

		describe("figures the records do not hold", () => {
			it("reports wall time as not recorded for each stage and for the run", async () => {
				const fixture = await emptyFixture();
				await fixture.writeStoppedRunEvidence();

				const response = await runRecord(fixture, fixture.stoppedRun);

				expect(await response.json()).toMatchObject({
					stages: [
						{ stage: "discuss", wallTime: { state: "unavailable" } },
						{ stage: "build", wallTime: { state: "unavailable" } },
					],
					totals: { wallTime: { state: "unavailable" } },
				});
			});

			it("reports a graded stage's letter and a stopped stage's letter as not recorded", async () => {
				const fixture = await emptyFixture();
				await fixture.writeStoppedRunEvidence();

				const response = await runRecord(fixture, fixture.stoppedRun);

				expect(await response.json()).toMatchObject({
					stages: [
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
				});
			});

			it("reports the Product Owner's spend as not recorded on a run without a main artifact", async () => {
				const fixture = await emptyFixture();
				await fixture.writeStoppedRunEvidence();

				const response = await runRecord(fixture, fixture.stoppedRun);

				expect(await response.json()).toMatchObject({
					totals: {
						productOwnerCost: {
							state: "unavailable",
							reasons: [PRODUCT_OWNER_COST_REASON],
						},
					},
				});
			});

			it("sums the run cost from the parts it names and names the part it lacks", async () => {
				const fixture = await emptyFixture();
				await fixture.writeStoppedRunEvidence();

				const response = await runRecord(fixture, fixture.stoppedRun);

				expect(await response.json()).toMatchObject({
					totals: {
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
					},
				});
			});

			it("sums a finished run's cost with its Product Owner and final judge", async () => {
				const fixture = await emptyFixture();
				await fixture.writePipelineRun(FINISHED_RUN, "audit-log");

				const response = await runRecord(fixture, FINISHED_RUN);

				expect(await response.json()).toMatchObject({
					totals: {
						productOwnerCost: { state: "available", usd: 0.25 },
						cost: {
							state: "available",
							usd: 0.25 + 1.5,
							parts: [
								{ part: "Product Owner", usd: 0.25 },
								{ part: "final judge", usd: 1.5 },
							],
							missing: [],
						},
					},
				});
			});
		});

		describe("a run it cannot serve", () => {
			it("answers 404 without the runs directory's path for a run it holds no record of", async () => {
				const fixture = await emptyFixture();

				const response = await runRecord(fixture, "2026-01-01T00-00-00.000Z");

				expect(response.status).toBe(404);
				expect(await response.text()).not.toContain(fixture.runsDirectory);
			});

			it("answers 400 for a run name that leaves the runs directory", async () => {
				const fixture = await emptyFixture();

				const response = await runRecord(fixture, "../outside");

				expect(response.status).toBe(400);
				expect(await response.text()).not.toContain(fixture.runsDirectory);
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
