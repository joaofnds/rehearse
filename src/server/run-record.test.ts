import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	directorySource,
	nothingRunning,
	RecordedRunsFixture,
} from "#benchmark/run-records-test-support";
import { createApiApp } from "./api";

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
	): Promise<Response> {
		const app = createApiApp({
			runsDirectory: fixture.runsDirectory,
			liveness: nothingRunning,
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
	});
});
