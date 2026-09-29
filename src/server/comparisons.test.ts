import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import {
	directorySource,
	RecordedRunsFixture,
	nothingRunning,
	fixedCorpusSource,
} from "#benchmark/run-records-test-support";
import {
	COMPARISON_ARMS,
	parseComparisonReport,
} from "#benchmark/comparison-record";
import type {
	ComparisonReport,
	LegacyComparisonReport,
} from "#benchmark/comparison-record";
import {
	armResourcesWithoutElapsed,
	contrastResourcesWithoutElapsed,
} from "#benchmark/comparison-test-fixtures";
import { comparisonReportPaths } from "#benchmark/run-layout";
import { writeComparisonReport } from "#benchmark/comparison-command";
import {
	ComparisonEvidenceFixture,
	digest as sha256Of,
} from "#benchmark/comparison-evidence-test-support";
import { NO_RECORDED_WORDS_REASON } from "./comparison-arm-figures";
import { createApiApp } from "./api";

const attributionSchema = z.discriminatedUnion("claim", [
	z.object({ claim: z.literal("identical") }),
	z.object({
		claim: z.literal("attributable"),
		differingPath: z.string(),
		differingPaths: z.tuple([z.string()]),
	}),
	z.object({
		claim: z.literal("refused"),
		differingPaths: z.array(z.string()).min(2),
	}),
]);
const qualityIntervalSchema = z
	.object({ low: z.string(), high: z.string() })
	.optional();
const qualityReadingSchema = z.object({
	interval: z.object({
		minuend: qualityIntervalSchema,
		subtrahend: qualityIntervalSchema,
	}),
	verdict: z.discriminatedUnion("kind", [
		z.object({ kind: z.literal("insideRerunNoise") }),
		z.object({ kind: z.literal("unchangedAlreadyClear") }),
		z.object({ kind: z.literal("separated"), arm: z.string() }),
	]),
});
const armFiguresSchema = z.object({
	measures: z.record(z.string(), z.unknown()),
	cost: z.unknown(),
	words: z.unknown(),
});
const recordedAttemptsSchema = z.array(
	z
		.object({ repId: z.string(), ordinal: z.number(), words: z.unknown() })
		.loose(),
);
const comparisonResponseSchema = z.object({
	report: z.unknown(),
	armFigures: z.record(z.string(), z.record(z.string(), armFiguresSchema)),
	attribution: z.record(z.string(), z.record(z.string(), attributionSchema)),
	qualityReadings: z.record(
		z.string(),
		z.record(z.string(), z.record(z.string(), qualityReadingSchema)),
	),
	whatMoved: z.record(
		z.string(),
		z.array(z.object({ kind: z.string(), name: z.string() }).loose()),
	),
	attempts: z.record(
		z.string(),
		z.object({
			baseline: recordedAttemptsSchema,
			candidate: recordedAttemptsSchema,
			control: recordedAttemptsSchema,
		}),
	),
});

const comparisonIndexResponseSchema = z.object({
	comparisons: z.array(z.object({ digest: z.string() })),
	unreadable: z.array(z.object({ id: z.string(), reason: z.string() })),
});

type ComparisonResponse = Omit<
	z.infer<typeof comparisonResponseSchema>,
	"report"
> & {
	readonly report: ComparisonReport | LegacyComparisonReport;
};

async function comparisonResponseFrom(
	response: Response,
): Promise<ComparisonResponse> {
	const parsed = comparisonResponseSchema.parse(await response.json());

	return {
		...parsed,
		report: parseComparisonReport(JSON.stringify(parsed.report)),
	};
}

async function rewriteFixtureAsSession(
	fixture: RecordedRunsFixture,
): Promise<void> {
	const { reportFile } = comparisonReportPaths(
		fixture.runsDirectory,
		fixture.comparisonDigest,
	);
	const pipeline = parseComparisonReport(await Bun.file(reportFile).text());
	if (pipeline.schemaVersion !== 5 || pipeline.mode !== "pipeline") {
		throw new Error("expected the fixture to write a current pipeline report");
	}

	const session = {
		...pipeline,
		schemaVersion: 3,
		mode: "session",
		declaredStages: ["checks"],
		judgeAgreement: { ...pipeline.judgeAgreement, baselines: [] },
		cases: pipeline.cases.map(({ caseId, arms }) => ({
			caseId,
			arms: Object.fromEntries(
				COMPARISON_ARMS.map((role) => [
					role,
					{
						...arms[role],
						resources: armResourcesWithoutElapsed(arms[role].resources),
						source: {
							...arms[role].source,
							reps: arms[role].source.reps.map((rep) => {
								const { outcomes: _outcomes, ...legacyRep } = rep;

								return {
									...legacyRep,
									attempt: {
										path: `attempts/${rep.repId}.json`,
										sha256: "a".repeat(64),
									},
								};
							}),
						},
						executedCorpus:
							role === "control"
								? []
								: arms[role].executedCorpus.map((file) => ({
										...file,
										path: "inputs/corpus/output-styles/brief.md",
									})),
						quality: [{ ...arms[role].quality[0], name: "checks" }],
					},
				]),
			),
		})),
		contrasts: Object.fromEntries(
			Object.entries(pipeline.contrasts).map(([pair, contrast]) => [
				pair,
				{
					...contrast,
					resources: contrastResourcesWithoutElapsed(contrast.resources),
					quality: [{ ...contrast.quality[0], name: "checks" }],
				},
			]),
		),
	};
	const sessionText = `${JSON.stringify(session, null, 2)}\n`;

	parseComparisonReport(sessionText);
	await Bun.write(reportFile, sessionText);
}

async function rewriteFixtureAsLegacyPipeline(
	fixture: RecordedRunsFixture,
	version: 1 | 2,
): Promise<void> {
	const { reportFile } = comparisonReportPaths(
		fixture.runsDirectory,
		fixture.comparisonDigest,
	);
	const current = parseComparisonReport(await Bun.file(reportFile).text());
	if (current.schemaVersion !== 5 || current.mode !== "pipeline") {
		throw new Error("expected the fixture to write a current pipeline report");
	}
	const cases = current.cases.map(({ caseId, arms }) => ({
		caseId,
		arms: Object.fromEntries(
			COMPARISON_ARMS.map((role) => [
				role,
				{
					...arms[role],
					resources: armResourcesWithoutElapsed(arms[role].resources),
					source: {
						...arms[role].source,
						reps: arms[role].source.reps.map((rep) => {
							const { outcomes: _outcomes, ...legacyRep } = rep;

							return legacyRep;
						}),
					},
				},
			]),
		),
	}));
	const contrasts = Object.fromEntries(
		Object.entries(current.contrasts).map(([pair, contrast]) => [
			pair,
			{
				...contrast,
				resources: contrastResourcesWithoutElapsed(contrast.resources),
			},
		]),
	);
	const legacy =
		version === 2
			? { ...current, schemaVersion: 2, cases, contrasts }
			: (() => {
					const { judgeAgreement: _judgeAgreement, ...fields } = current;

					return { ...fields, schemaVersion: 1, cases, contrasts };
				})();
	const text = `${JSON.stringify(legacy, null, 2)}\n`;

	parseComparisonReport(text);
	await Bun.write(reportFile, text);
}

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
	);
});

async function corpusDirectory(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-comparisons-corpus-"));
	roots.push(root);

	return root;
}

async function writtenFixture(): Promise<RecordedRunsFixture> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-comparisons-"));
	roots.push(root);
	const fixture = new RecordedRunsFixture(root);
	await fixture.write();

	return fixture;
}

describe("GET /api/comparisons", () => {
	it("lists every saved comparison in digest order, each with its mode, cases and reps", async () => {
		const fixture = await writtenFixture();
		const earlierDigest = "0".repeat(64);
		const earlier = comparisonReportPaths(fixture.runsDirectory, earlierDigest);
		await mkdir(earlier.directory, { recursive: true });
		await Bun.write(
			earlier.reportFile,
			Bun.file(
				comparisonReportPaths(fixture.runsDirectory, fixture.comparisonDigest)
					.reportFile,
			),
		);
		const app = createApiApp({
			runsDirectory: fixture.runsDirectory,
			liveness: nothingRunning,
			readCorpusSource: fixedCorpusSource(
				directorySource(await corpusDirectory()),
			),
		});

		const response = await app.request("/api/comparisons");

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			comparisons: [earlierDigest, fixture.comparisonDigest].map((digest) => ({
				digest,
				mode: "pipeline",
				caseIds: ["case-1", "case-2"],
				reps: 4,
			})),
			unreadable: [],
		});
	});

	describe("when a comparison cannot be read", () => {
		const corruptDigest = "a".repeat(64);
		const missingReportDigest = "b".repeat(64);
		const unrecognizedReportDigest = "d".repeat(64);

		async function fixtureWithUnreadableComparisons(): Promise<RecordedRunsFixture> {
			const fixture = await writtenFixture();
			const corrupt = comparisonReportPaths(
				fixture.runsDirectory,
				corruptDigest,
			);
			await mkdir(corrupt.directory, { recursive: true });
			await Bun.write(corrupt.reportFile, "{ not json");
			await mkdir(
				comparisonReportPaths(fixture.runsDirectory, missingReportDigest)
					.directory,
				{ recursive: true },
			);
			const unrecognizedReport = comparisonReportPaths(
				fixture.runsDirectory,
				unrecognizedReportDigest,
			);
			await mkdir(unrecognizedReport.directory, { recursive: true });
			await Bun.write(unrecognizedReport.reportFile, '{ "mode": "session" }');

			return fixture;
		}

		it("lists it as unreadable while every readable comparison still lists", async () => {
			const fixture = await fixtureWithUnreadableComparisons();
			const app = createApiApp({
				runsDirectory: fixture.runsDirectory,
				liveness: nothingRunning,
				readCorpusSource: fixedCorpusSource(
					directorySource(await corpusDirectory()),
				),
			});

			const response = await app.request("/api/comparisons");

			expect(response.status).toBe(200);
			const index = comparisonIndexResponseSchema.parse(await response.json());
			expect(index.comparisons.map(({ digest }) => digest)).toEqual([
				fixture.comparisonDigest,
			]);
			expect(index.unreadable.map(({ id }) => id)).toEqual([
				corruptDigest,
				missingReportDigest,
				unrecognizedReportDigest,
			]);
			expect(index.unreadable.filter(({ reason }) => reason === "")).toEqual(
				[],
			);
		});

		it("gives a reason that names no absolute path", async () => {
			const fixture = await fixtureWithUnreadableComparisons();
			const app = createApiApp({
				runsDirectory: fixture.runsDirectory,
				liveness: nothingRunning,
				readCorpusSource: fixedCorpusSource(
					directorySource(await corpusDirectory()),
				),
			});

			const response = await app.request("/api/comparisons");

			const { unreadable } = comparisonIndexResponseSchema.parse(
				await response.json(),
			);
			expect(unreadable.map(({ id }) => id)).toContain(missingReportDigest);
			expect(JSON.stringify(unreadable)).not.toMatch(
				/\/(?:Users|home|var|tmp)\//u,
			);
		});

		it("names a report no known version matches in one short line", async () => {
			const fixture = await fixtureWithUnreadableComparisons();
			const app = createApiApp({
				runsDirectory: fixture.runsDirectory,
				liveness: nothingRunning,
				readCorpusSource: fixedCorpusSource(
					directorySource(await corpusDirectory()),
				),
			});

			const response = await app.request("/api/comparisons");

			const { unreadable } = comparisonIndexResponseSchema.parse(
				await response.json(),
			);
			expect(
				unreadable.find(({ id }) => id === unrecognizedReportDigest),
			).toEqual({
				id: unrecognizedReportDigest,
				reason: "report.json matches no known comparison report",
			});
		});
	});
});

describe("GET /api/comparisons/:digest", () => {
	it("renders the recorded report plus attribution for every case and contrast", async () => {
		const fixture = await writtenFixture();
		const app = createApiApp({
			runsDirectory: fixture.runsDirectory,
			liveness: nothingRunning,
			readCorpusSource: fixedCorpusSource(
				directorySource(await corpusDirectory()),
			),
		});

		const response = await app.request(
			`/api/comparisons/${fixture.comparisonDigest}`,
		);
		const body = await comparisonResponseFrom(response);

		expect(response.status).toBe(200);
		if (body.report.schemaVersion !== 5) {
			throw new Error("expected the public API to serve a version-5 report");
		}
		expect(body.report.cases.map(({ caseId }) => caseId)).toEqual([
			"case-1",
			"case-2",
		]);
		expect(
			body.report.cases[0]?.arms.baseline.source.reps[0]?.outcomes,
		).toEqual([
			{
				name: "discuss",
				status: "JUDGED",
				grade: "A",
				successful: true,
			},
			{
				name: "build",
				status: "JUDGED",
				grade: "A",
				successful: true,
			},
			{
				name: "final",
				status: "JUDGED",
				grade: "PASS",
				successful: true,
			},
		]);
		for (const caseId of ["case-1", "case-2"]) {
			expect(Object.keys(body.attribution[caseId] ?? {}).toSorted()).toEqual([
				"baselineMinusControl",
				"candidateMinusBaseline",
				"candidateMinusControl",
			]);
			expect(body.attribution[caseId]?.["candidateMinusBaseline"]).toEqual({
				claim: "attributable",
				differingPath: "inputs/corpus/SKILL.md",
				differingPaths: ["inputs/corpus/SKILL.md"],
			});
		}
	});

	it("uses session-mode layout paths in the public response", async () => {
		const fixture = await writtenFixture();
		await rewriteFixtureAsSession(fixture);
		const app = createApiApp({
			runsDirectory: fixture.runsDirectory,
			liveness: nothingRunning,
			readCorpusSource: fixedCorpusSource(
				directorySource(await corpusDirectory()),
			),
		});

		const response = await app.request(
			`/api/comparisons/${fixture.comparisonDigest}`,
		);
		const body = await comparisonResponseFrom(response);

		expect(response.status).toBe(200);
		expect(body.report.mode).toBe("session");
		expect(body.attribution["case-1"]?.["candidateMinusBaseline"]).toEqual({
			claim: "attributable",
			differingPath: "output-styles/brief.md",
			differingPaths: ["output-styles/brief.md"],
		});
	});

	it.each([1, 2] as const)(
		"serves a version-%i pipeline report through the public API",
		async (version) => {
			const fixture = await writtenFixture();
			await rewriteFixtureAsLegacyPipeline(fixture, version);
			const app = createApiApp({
				runsDirectory: fixture.runsDirectory,
				liveness: nothingRunning,
				readCorpusSource: fixedCorpusSource(
					directorySource(await corpusDirectory()),
				),
			});

			const response = await app.request(
				`/api/comparisons/${fixture.comparisonDigest}`,
			);
			const body = await comparisonResponseFrom(response);

			expect(response.status).toBe(200);
			expect(body.report.schemaVersion).toBe(version);
			expect(body.report.mode).toBe("pipeline");
		},
	);

	describe("arm figures", () => {
		async function armFiguresOf(
			fixture: RecordedRunsFixture,
		): Promise<ComparisonResponse["armFigures"]> {
			const app = createApiApp({
				runsDirectory: fixture.runsDirectory,
				liveness: nothingRunning,
				readCorpusSource: fixedCorpusSource(
					directorySource(await corpusDirectory()),
				),
			});

			const response = await app.request(
				`/api/comparisons/${fixture.comparisonDigest}`,
			);

			const body = await comparisonResponseFrom(response);

			return body.armFigures;
		}

		it("gives each arm its median and range per stage, its final successes, its cost, and no word count from a report whose reps carry none", async () => {
			const fixture = await writtenFixture();

			const figures = await armFiguresOf(fixture);

			expect(figures["case-1"]?.["baseline"]).toEqual({
				measures: {
					discuss: {
						scale: "letters",
						grades: {
							state: "available",
							median: "D",
							lowest: "D",
							highest: "A",
						},
					},
					build: {
						scale: "letters",
						grades: {
							state: "available",
							median: "D",
							lowest: "D",
							highest: "A",
						},
					},
					final: { scale: "successRate", successful: 2, attempts: 4 },
				},
				cost: { state: "available", totalUsd: 10, perAttemptUsd: 2.5 },
				words: {
					state: "unavailable",
					reasons: [NO_RECORDED_WORDS_REASON],
				},
			});
		});

		it("gives a session arm its successes of attempts and no letter", async () => {
			const fixture = await writtenFixture();
			await rewriteFixtureAsSession(fixture);

			const figures = await armFiguresOf(fixture);

			expect(figures["case-1"]?.["candidate"]?.measures).toEqual({
				checks: { scale: "successRate", successful: 4, attempts: 4 },
			});
		});

		it.each([1, 2] as const)(
			"reads a version-%i report's arms",
			async (version) => {
				const fixture = await writtenFixture();
				await rewriteFixtureAsLegacyPipeline(fixture, version);

				const figures = await armFiguresOf(fixture);

				expect(figures["case-2"]?.["control"]).toEqual({
					measures: {
						discuss: {
							scale: "letters",
							grades: {
								state: "available",
								median: "D",
								lowest: "D",
								highest: "D",
							},
						},
						build: {
							scale: "letters",
							grades: {
								state: "available",
								median: "D",
								lowest: "D",
								highest: "D",
							},
						},
						final: { scale: "successRate", successful: 0, attempts: 4 },
					},
					cost: { state: "available", totalUsd: 10, perAttemptUsd: 2.5 },
					words: {
						state: "unavailable",
						reasons: [NO_RECORDED_WORDS_REASON],
					},
				});
			},
		);
	});

	it("renders a quality reading for the discuss measure, per case per contrast", async () => {
		const fixture = await writtenFixture();
		const app = createApiApp({
			runsDirectory: fixture.runsDirectory,
			liveness: nothingRunning,
			readCorpusSource: fixedCorpusSource(
				directorySource(await corpusDirectory()),
			),
		});

		const response = await app.request(
			`/api/comparisons/${fixture.comparisonDigest}`,
		);
		const body = await comparisonResponseFrom(response);

		expect(
			body.qualityReadings["case-1"]?.["candidateMinusBaseline"]?.["discuss"],
		).toEqual({
			interval: {
				minuend: { low: "A", high: "A" },
				subtrahend: { low: "A", high: "D" },
			},
			verdict: { kind: "insideRerunNoise" },
		});
		expect(
			body.qualityReadings["case-1"]?.["candidateMinusControl"]?.["discuss"],
		).toEqual({
			interval: {
				minuend: { low: "A", high: "A" },
				subtrahend: { low: "D", high: "D" },
			},
			verdict: { kind: "separated", arm: "candidate" },
		});
	});

	it("renders a quality reading for every declared-stage measure and, in pipeline mode, the final row", async () => {
		const fixture = await writtenFixture();
		const app = createApiApp({
			runsDirectory: fixture.runsDirectory,
			liveness: nothingRunning,
			readCorpusSource: fixedCorpusSource(
				directorySource(await corpusDirectory()),
			),
		});

		const response = await app.request(
			`/api/comparisons/${fixture.comparisonDigest}`,
		);
		const body = await comparisonResponseFrom(response);
		const readings = body.qualityReadings["case-1"]?.["candidateMinusBaseline"];

		expect(Object.keys(readings ?? {}).toSorted()).toEqual([
			"build",
			"discuss",
			"final",
		]);
		expect(readings?.["build"]).toEqual({
			interval: {
				minuend: { low: "A", high: "A" },
				subtrahend: { low: "A", high: "D" },
			},
			verdict: { kind: "insideRerunNoise" },
		});
		expect(readings?.["final"]).toEqual({
			interval: {
				minuend: { low: "51%", high: "100%" },
				subtrahend: { low: "15%", high: "85%" },
			},
			verdict: { kind: "insideRerunNoise" },
		});
	});

	it("reads a session's checks as success-rate intervals rather than letter spans", async () => {
		const fixture = await writtenFixture();
		await rewriteFixtureAsSession(fixture);
		const app = createApiApp({
			runsDirectory: fixture.runsDirectory,
			liveness: nothingRunning,
			readCorpusSource: fixedCorpusSource(
				directorySource(await corpusDirectory()),
			),
		});

		const response = await app.request(
			`/api/comparisons/${fixture.comparisonDigest}`,
		);
		const body = await comparisonResponseFrom(response);

		expect(
			body.qualityReadings["case-1"]?.["candidateMinusBaseline"]?.["checks"]
				?.interval,
		).toEqual({
			minuend: { low: "51%", high: "100%" },
			subtrahend: { low: "15%", high: "85%" },
		});
	});

	it("renders exactly the report's three canonical contrasts per case, not all six ordered pairs", async () => {
		const fixture = await writtenFixture();
		const app = createApiApp({
			runsDirectory: fixture.runsDirectory,
			liveness: nothingRunning,
			readCorpusSource: fixedCorpusSource(
				directorySource(await corpusDirectory()),
			),
		});

		const response = await app.request(
			`/api/comparisons/${fixture.comparisonDigest}`,
		);
		const body = await comparisonResponseFrom(response);

		expect(Object.keys(body.attribution["case-1"] ?? {}).toSorted()).toEqual([
			"baselineMinusControl",
			"candidateMinusBaseline",
			"candidateMinusControl",
		]);
	});

	it("refuses a digest whose segment escapes the runs directory, without a 500", async () => {
		const root = await mkdtemp(join(tmpdir(), "rehearse-comparisons-escape-"));
		roots.push(root);
		const app = createApiApp({
			runsDirectory: root,
			liveness: nothingRunning,
			readCorpusSource: fixedCorpusSource(
				directorySource(await corpusDirectory()),
			),
		});

		const response = await app.request(
			`/api/comparisons/${encodeURIComponent("../../etc/passwd")}`,
		);

		expect(response.status).toBe(400);
	});

	it("refuses a digest that names no recorded comparison, without a 500", async () => {
		const root = await mkdtemp(join(tmpdir(), "rehearse-comparisons-empty-"));
		roots.push(root);
		const app = createApiApp({
			runsDirectory: root,
			liveness: nothingRunning,
			readCorpusSource: fixedCorpusSource(
				directorySource(await corpusDirectory()),
			),
		});

		const response = await app.request(`/api/comparisons/${"9".repeat(64)}`);

		expect(response.status).toBe(404);
	});
});

describe("What moved", () => {
	async function oneCheckpointComparison(
		change?: (fixture: ComparisonEvidenceFixture) => Promise<void>,
	): Promise<ComparisonResponse> {
		const root = await mkdtemp(join(tmpdir(), "rehearse-what-moved-"));
		roots.push(root);
		const fixture = new ComparisonEvidenceFixture(root, ["build-checkpoint"]);
		await fixture.write();
		await change?.(fixture);
		const runsDirectory = join(root, "runs");
		await mkdir(runsDirectory);
		await writeComparisonReport({
			manifestPath: fixture.manifestFile,
			runsDirectory,
		});
		const app = createApiApp({
			runsDirectory,
			liveness: nothingRunning,
			readCorpusSource: fixedCorpusSource(
				directorySource(await corpusDirectory()),
			),
		});

		const response = await app.request(
			`/api/comparisons/${sha256Of(await Bun.file(fixture.manifestFile).text())}`,
		);

		return comparisonResponseFrom(response);
	}

	async function oneCheckpointRows(): Promise<ComparisonResponse["whatMoved"]> {
		const comparison = await oneCheckpointComparison();

		return comparison.whatMoved;
	}

	it("refuses attribution and names every path when the arms differ in more than one", async () => {
		const { attribution } = await oneCheckpointComparison((fixture) =>
			fixture.addCorpusFile(
				"build-checkpoint",
				"candidate",
				"inputs/corpus/build/reference.md",
				"candidate reference\n",
			),
		);

		expect(attribution["build-checkpoint"]?.["candidateMinusBaseline"]).toEqual(
			{
				claim: "refused",
				differingPaths: ["SKILL.md", "reference.md"],
			},
		);
	});

	it("rows a one-checkpoint stage comparison by overall, blocker, dimension and meter", async () => {
		const rows = await oneCheckpointRows();

		expect(
			rows["build-checkpoint"]?.map(({ kind, name }) => `${kind} ${name}`),
		).toEqual([
			"overall build",
			"hardBlocker scope-declared",
			"dimension clarity",
			"meter replyLength",
			"meter costPerAttempt",
		]);
	});

	it("counts a hard blocker's firings of the reps graded on it, with a reading per arm pair", async () => {
		const rows = await oneCheckpointRows();
		const blocker = rows["build-checkpoint"]?.find(
			({ kind }) => kind === "hardBlocker",
		);

		expect(blocker).toMatchObject({
			stage: "build",
			arms: {
				baseline: { state: "available", fired: 2, of: 2 },
				candidate: { state: "available", fired: 0, of: 2 },
			},
			readings: {
				candidateMinusBaseline: {
					interval: {
						minuend: { low: "0%", high: "66%" },
						subtrahend: { low: "34%", high: "100%" },
					},
					verdict: { kind: "insideRerunNoise" },
				},
				candidateMinusControl: { verdict: { kind: "unchangedAlreadyClear" } },
			},
		});
	});

	it("reads a dimension whose letter spans do not overlap as separated", async () => {
		const rows = await oneCheckpointRows();
		const dimension = rows["build-checkpoint"]?.find(
			({ kind }) => kind === "dimension",
		);

		expect(dimension).toMatchObject({
			arms: {
				baseline: { state: "available", median: "C" },
				candidate: { state: "available", median: "A" },
			},
			readings: {
				candidateMinusBaseline: {
					interval: {
						minuend: { low: "A", high: "A" },
						subtrahend: { low: "C", high: "C" },
					},
					verdict: { kind: "separated", arm: "candidate" },
				},
			},
		});
	});

	it("serves each arm's average words from the words its reps recorded", async () => {
		const { armFigures } = await oneCheckpointComparison();

		expect(armFigures["build-checkpoint"]?.["candidate"]?.words).toEqual({
			state: "available",
			averageWords: 3.5,
			counted: 2,
			attempts: 2,
		});
	});

	it("spreads reply length and cost per attempt across each arm's attempts, reading two apart attempts an arm as rerun noise", async () => {
		const rows = await oneCheckpointRows();
		const meter = (
			name: string,
		): ComparisonResponse["whatMoved"][string][number] | undefined =>
			rows["build-checkpoint"]?.find((row) => row.name === name);

		expect(meter("replyLength")).toMatchObject({
			arms: {
				baseline: {
					state: "available",
					mean: 7.5,
					low: 7,
					high: 8,
					counted: 2,
				},
				candidate: {
					state: "available",
					mean: 3.5,
					low: 3,
					high: 4,
					counted: 2,
				},
			},
			readings: {
				candidateMinusBaseline: {
					change: "-53%",
					verdict: { kind: "insideRerunNoise" },
				},
			},
		});
		expect(meter("costPerAttempt")).toMatchObject({
			arms: {
				candidate: { state: "available", mean: 1.5, low: 1, high: 2 },
			},
			readings: {
				candidateMinusBaseline: {
					interval: {
						minuend: { low: 1, high: 2 },
						subtrahend: { low: 1, high: 2 },
					},
				},
			},
		});
	});

	it("lists each arm's recorded attempts side by side by ordinal, claiming no pairing between arms", async () => {
		const { attempts } = await oneCheckpointComparison();
		const byArm = attempts["build-checkpoint"];

		expect(
			byArm?.candidate.map(({ ordinal, words }) => ({ ordinal, words })),
		).toEqual([
			{ ordinal: 1, words: { state: "available", words: 3 } },
			{ ordinal: 2, words: { state: "available", words: 4 } },
		]);
		expect(byArm?.baseline.map(({ repId }) => repId)).toEqual([
			"build-checkpoint-baseline-rep-1",
			"build-checkpoint-baseline-rep-2",
		]);
		expect(
			[
				...(byArm?.baseline ?? []),
				...(byArm?.candidate ?? []),
				...(byArm?.control ?? []),
			].map((attempt) => Object.keys(attempt).toSorted()),
		).toEqual(
			Array.from({ length: 6 }, () => [
				"blockersFired",
				"ordinal",
				"outcomes",
				"repId",
				"words",
			]),
		);
	});
});
