import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

import type { RunLiveness } from "#benchmark/run-liveness";
import {
	directorySource,
	nothingRunning,
	RecordedRunsFixture,
} from "#benchmark/run-records-test-support";
import { createApiApp } from "./api";
import { NOT_RUN_REASON } from "./run-history";
import { STOPPED_GRADE_REASON } from "./run-record";

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

type ListedRow = z.infer<typeof runHistorySchema>["rows"][number];

const liveRun: RunLiveness = {
	readMarker: () => Promise.resolve({ pid: 1 }),
	isAlive: () => true,
};

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
		});
	});
});
