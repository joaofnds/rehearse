import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import {
	RUN,
	recordAnalysis,
	runStoppedAtBuild,
} from "#benchmark/root-cause-analysis-test-support";
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
const readingSchema = z.object({
	newest: z.unknown(),
	unreadable: z.array(z.object({ file: z.string(), reason: z.string() })),
	request: z.object({
		capUsd: z.number().nullable(),
		refusal: z.string().nullable(),
	}),
});

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
		const newest = await recordAnalysis(directory, "2026-10-04T13:00:00.000Z");
		await recordAnalysis(directory, "2026-10-04T12:00:00.000Z");

		const response = await analysesOf(directory, RUN);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			run: RUN,
			newest: newest.record,
			earlierCount: 1,
			unreadable: [],
		});
	});

	it("says a run with no analysis has none", async () => {
		const directory = await recordedRun();

		const response = await analysesOf(directory, RUN);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			run: RUN,
			newest: null,
			earlierCount: 0,
		});
	});

	it("serves a failed analysis as the newest when it came last", async () => {
		const directory = await recordedRun();
		await recordAnalysis(directory, "2026-10-04T12:00:00.000Z");
		const failed = await recordAnalysis(directory, "2026-10-04T13:00:00.000Z", {
			rootCause: null,
		});

		const response = await analysesOf(directory, RUN);

		expect(failed.record.outcome).toBe("failed");
		expect(await response.json()).toMatchObject({
			newest: failed.record,
			earlierCount: 1,
		});
	});

	describe("when the newest analysis predates the rename to root-cause analysis", () => {
		it("serves it under the new names", async () => {
			const directory = await recordedRun();
			const earlier = await recordAnalysis(
				directory,
				"2026-10-04T12:00:00.000Z",
			);
			const { run, model, capUsd, durationMs, bundleDigest, bundleBytes } =
				earlier.record;
			await Bun.write(
				join(dirname(earlier.file), "2026-10-04T13-00-00.000Z.json"),
				JSON.stringify({
					schemaVersion: 1,
					run,
					model,
					capUsd,
					durationMs,
					bundleDigest,
					bundleBytes,
					startedAt: "2026-10-04T13:00:00.000Z",
					outcome: "recorded",
					culprit: null,
					narrative: "No corpus file explains the outcome.",
					pairedRerun: "Rerun build with the location stated in the task.",
					stages: [
						{
							stage: "build",
							role: "not implicated",
							note: "No corpus file build read names a directory.",
							contribution: "placed code at a path the rubric rejected",
						},
					],
				}),
			);

			const response = await analysesOf(directory, RUN);

			expect(await response.json()).toMatchObject({
				newest: {
					schemaVersion: 2,
					startedAt: "2026-10-04T13:00:00.000Z",
					rootCause: null,
					stages: [{ stage: "build", role: "not a factor" }],
				},
				earlierCount: 1,
				unreadable: [],
			});
		});
	});

	describe("when an analysis record cannot be read", () => {
		it("lists it apart and still serves the readable ones", async () => {
			const directory = await recordedRun();
			const readable = await recordAnalysis(
				directory,
				"2026-10-04T12:00:00.000Z",
			);
			await Bun.write(
				join(dirname(readable.file), "2026-10-04T13-00-00.000Z.json"),
				'{"schemaVersion":2,',
			);

			const response = await analysesOf(directory, RUN);
			const reading = readingSchema.parse(await response.json());

			expect(response.status).toBe(200);
			expect(reading.newest).toEqual(readable.record);
			expect(reading.unreadable.map(({ file }) => file)).toEqual([
				"2026-10-04T13-00-00.000Z.json",
			]);
			expect(reading.unreadable[0]?.reason).not.toContain(directory);
		});
	});

	it("states what a requested analysis may spend and the model it runs under", async () => {
		const directory = await recordedRun();
		await storeSpendCeiling(directory, 30);

		const response = await analysesOf(directory, RUN);

		expect(await response.json()).toMatchObject({
			request: { model: "sonnet", capUsd: 1, refusal: null },
		});
	});

	describe("when the stored ceiling is below the analysis budget", () => {
		it("states the ceiling as what it may spend", async () => {
			const directory = await recordedRun();
			await storeSpendCeiling(directory, 0.5);

			const response = await analysesOf(directory, RUN);

			expect(await response.json()).toMatchObject({
				request: { model: "sonnet", capUsd: 0.5, refusal: null },
			});
		});
	});

	describe("when no spend ceiling is stored", () => {
		it("states that a request would be refused, and how to allow one", async () => {
			const directory = await recordedRun();

			const response = await analysesOf(directory, RUN);
			const { request } = readingSchema.parse(await response.json());

			expect(request.capUsd).toBeNull();
			expect(request.refusal).toContain(SET_SPEND_CEILING_COMMAND);
		});
	});

	describe("when the settings file cannot be read", () => {
		it("still serves the analyses, and states the refusal without the records path", async () => {
			const directory = await recordedRun();
			const newest = await recordAnalysis(
				directory,
				"2026-10-04T12:00:00.000Z",
			);
			await Bun.write(join(directory, "settings.json"), "not json");

			const response = await analysesOf(directory, RUN);
			const reading = readingSchema.parse(await response.json());

			expect(response.status).toBe(200);
			expect(reading.newest).toEqual(newest.record);
			expect(reading.request.capUsd).toBeNull();
			expect(reading.request.refusal).toContain(SET_SPEND_CEILING_COMMAND);
			expect(reading.request.refusal).not.toContain(directory);
		});
	});

	describe("when the settings file exists but cannot be opened", () => {
		it("still serves the analyses, and states the refusal", async () => {
			const directory = await recordedRun();
			const newest = await recordAnalysis(
				directory,
				"2026-10-04T12:00:00.000Z",
			);
			await mkdir(join(directory, "settings.json"));

			const response = await analysesOf(directory, RUN);
			const reading = readingSchema.parse(await response.json());

			expect(response.status).toBe(200);
			expect(reading.newest).toEqual(newest.record);
			expect(reading.request.capUsd).toBeNull();
			expect(reading.request.refusal).not.toContain(directory);
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
