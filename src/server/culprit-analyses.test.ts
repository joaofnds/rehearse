import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import {
	RUN,
	recordAnalysis,
	runStoppedAtBuild,
} from "#benchmark/culprit-analysis-test-support";
import {
	fixedCorpusSource,
	directorySource,
	NO_PROVIDER_PROJECTS,
	nothingRunning,
} from "#benchmark/run-records-test-support";
import {
	SET_SPEND_CEILING_COMMAND,
	storeSpendCeiling,
} from "#benchmark/settings";
import { createApiApp } from "./api";

const refusalSchema = z.object({ error: z.string() });

describe("GET /api/runs/:run/analyses", () => {
	const roots: string[] = [];

	afterEach(async () => {
		await Promise.all(
			roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
		);
	});

	async function recordedRun(): Promise<string> {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-analyses-"));
		roots.push(directory);
		await runStoppedAtBuild(directory);

		return directory;
	}

	function analysesOf(directory: string, run: string): Promise<Response> {
		const app = createApiApp({
			projectsDirectory: NO_PROVIDER_PROJECTS,
			runsDirectory: directory,
			liveness: nothingRunning,
			readCorpusSource: fixedCorpusSource(directorySource(directory)),
		});

		return Promise.resolve(app.request(`/api/runs/${run}/analyses`));
	}

	it("serves the run's newest analysis and how many earlier ones it holds", async () => {
		const directory = await recordedRun();
		await recordAnalysis(directory, "2026-10-04T12:00:00.000Z");
		const newest = await recordAnalysis(directory, "2026-10-04T13:00:00.000Z");

		const response = await analysesOf(directory, RUN);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			newest: newest.record,
			earlier: 1,
		});
	});

	it("says a run with no analysis has none", async () => {
		const directory = await recordedRun();

		const response = await analysesOf(directory, RUN);

		expect(await response.json()).toMatchObject({ newest: null, earlier: 0 });
	});

	it("states what a requested analysis may spend and the model it runs under", async () => {
		const directory = await recordedRun();
		await storeSpendCeiling(directory, 30);

		const response = await analysesOf(directory, RUN);

		expect(await response.json()).toMatchObject({
			request: { model: "sonnet", capUsd: 1 },
		});
	});

	describe("when the stored ceiling is below the analysis budget", () => {
		it("states the ceiling as what it may spend", async () => {
			const directory = await recordedRun();
			await storeSpendCeiling(directory, 0.5);

			const response = await analysesOf(directory, RUN);

			expect(await response.json()).toMatchObject({
				request: { model: "sonnet", capUsd: 0.5 },
			});
		});
	});

	describe("when no spend ceiling is stored", () => {
		it("states that a request can spend nothing", async () => {
			const directory = await recordedRun();

			const response = await analysesOf(directory, RUN);

			expect(await response.json()).toMatchObject({
				request: { model: "sonnet", capUsd: null },
			});
		});
	});

	describe("when the settings file cannot be read", () => {
		it("answers a conflict naming the fix, without the records path", async () => {
			const directory = await recordedRun();
			await Bun.write(join(directory, "settings.json"), "not json");

			const response = await analysesOf(directory, RUN);
			const { error } = refusalSchema.parse(await response.json());

			expect(response.status).toBe(409);
			expect(error).toContain(SET_SPEND_CEILING_COMMAND);
			expect(error).not.toContain(directory);
		});
	});

	describe("when the run is not recorded", () => {
		it("answers not found", async () => {
			const directory = await recordedRun();

			const response = await analysesOf(directory, "2026-01-01T00-00-00.000Z");

			expect(response.status).toBe(404);
			expect(refusalSchema.parse(await response.json()).error).toBe(
				"No run 2026-01-01T00-00-00.000Z is recorded",
			);
		});
	});
});
