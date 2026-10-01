import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeRunManifest } from "#benchmark/manifest";
import { benchmarkRunPaths } from "#benchmark/run-layout";
import { TEST_TARGET } from "#benchmark/test-support";
import {
	directorySource,
	fixedCorpusSource,
	NO_PROVIDER_PROJECTS,
	nothingRunning,
} from "#benchmark/run-records-test-support";
import { createApiApp } from "./api";
import type { StageTime } from "./stage-times";
import { NO_EARLIER_RUN_REASON, noRecordedTimeReason } from "./stage-times";

const CASE = "audit-log";
const STAGES = ["discuss", "build", "review"] as const;

const RUN = "2026-10-01T10-00-00.000Z";
const FIRST_EARLIER = "2026-09-29T10-00-00.000Z";
const SECOND_EARLIER = "2026-09-30T10-00-00.000Z";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
	);
});

async function runsDirectory(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-stage-times-"));
	roots.push(root);

	return root;
}

/** A pipeline run of a case, with the elapsed time each listed stage recorded. */
async function recordRun(
	directory: string,
	props: {
		readonly run: string;
		readonly caseId?: string;
		readonly stageMs?: Readonly<Partial<Record<string, number>>>;
	},
): Promise<void> {
	const paths = benchmarkRunPaths(directory, props.run);
	await writeRunManifest(paths.manifestFile, {
		caseId: props.caseId ?? CASE,
		timestamp: props.run,
		controlSha: "control-sha",
		sourceRoot: join(directory, "source"),
		sourceSha: "source-sha",
		taskId: "TASK-1",
		taskSha: "task-sha",
		task: "Task text",
		productBrief: "Brief text",
		model: "sonnet",
		judgeModel: "opus",
		sessionBudgetUsd: 5,
		pipeline: {
			statuses: ["To Do", "Done"],
			target: TEST_TARGET,
			stages: STAGES.map((name) => ({
				name,
				kind: "delivery",
				skill: name,
				rubric: `rubrics/${name}.json`,
			})),
		},
		pipelinePath: "pipelines/default.json",
	});
	for (const [stage, elapsedMs] of Object.entries(props.stageMs ?? {})) {
		await Bun.write(paths.stageFile(stage), JSON.stringify({ elapsedMs }));
	}
}

function unrecorded(stage: string): StageTime {
	return {
		stage,
		state: "unavailable",
		reasons: [noRecordedTimeReason(stage)],
	};
}

async function stageTimes(directory: string, run: string): Promise<Response> {
	const app = createApiApp({
		projectsDirectory: NO_PROVIDER_PROJECTS,
		runsDirectory: directory,
		liveness: nothingRunning,
		readCorpusSource: fixedCorpusSource(directorySource(directory)),
	});

	const response = await app.request(
		`/api/runs/${encodeURIComponent(run)}/stage-times`,
	);

	return response;
}

describe("/api/runs/:run/stage-times", () => {
	it("gives each stage of the run the median time earlier runs of its case took in it", async () => {
		const directory = await runsDirectory();
		await recordRun(directory, {
			run: FIRST_EARLIER,
			stageMs: { discuss: 60_000, build: 300_000, review: 100_000 },
		});
		await recordRun(directory, {
			run: SECOND_EARLIER,
			stageMs: { discuss: 120_000, build: 500_000, review: 140_000 },
		});
		await recordRun(directory, { run: RUN });

		const response = await stageTimes(directory, RUN);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			stages: [
				{ stage: "discuss", state: "available", medianMs: 90_000 },
				{ stage: "build", state: "available", medianMs: 400_000 },
				{ stage: "review", state: "available", medianMs: 120_000 },
			],
		});
	});

	it("leaves out runs of another case and runs started after this one", async () => {
		const directory = await runsDirectory();
		await recordRun(directory, {
			run: FIRST_EARLIER,
			stageMs: { discuss: 60_000 },
		});
		await recordRun(directory, {
			run: SECOND_EARLIER,
			caseId: "smoke",
			stageMs: { discuss: 999_000 },
		});
		await recordRun(directory, { run: RUN });
		await recordRun(directory, {
			run: "2026-10-02T10-00-00.000Z",
			stageMs: { discuss: 999_000 },
		});

		const response = await stageTimes(directory, RUN);

		expect(await response.json()).toEqual({
			stages: [
				{ stage: "discuss", state: "available", medianMs: 60_000 },
				unrecorded("build"),
				unrecorded("review"),
			],
		});
	});

	describe("when no earlier run recorded a stage's time", () => {
		it("says no earlier run of the case exists", async () => {
			const directory = await runsDirectory();
			await recordRun(directory, { run: RUN });

			const response = await stageTimes(directory, RUN);

			expect(await response.json()).toEqual({
				stages: STAGES.map((stage) => ({
					stage,
					state: "unavailable",
					reasons: [NO_EARLIER_RUN_REASON],
				})),
			});
		});

		it("says no earlier run of the case recorded that stage's time", async () => {
			const directory = await runsDirectory();
			await recordRun(directory, {
				run: FIRST_EARLIER,
				stageMs: { discuss: 60_000 },
			});
			await recordRun(directory, { run: RUN });

			const response = await stageTimes(directory, RUN);

			expect(await response.json()).toEqual({
				stages: [
					{ stage: "discuss", state: "available", medianMs: 60_000 },
					unrecorded("build"),
					unrecorded("review"),
				],
			});
		});
	});

	it("refuses a run that is not recorded", async () => {
		const directory = await runsDirectory();

		const response = await stageTimes(directory, RUN);

		expect(response.status).toBe(404);
	});
});
