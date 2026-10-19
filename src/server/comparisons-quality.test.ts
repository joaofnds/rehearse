import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import buildComparisonReport from "#benchmark/comparison-report";
import { singleCaseSessionEvidenceFixture } from "#benchmark/comparison-session-test-fixtures";
import { comparisonReportPaths } from "#benchmark/run-layout";
import {
	clearComparisonRoots,
	writtenFixture,
} from "#server/comparison-endpoint-test-fixture";
import { rewriteFixtureAsSession } from "#server/comparison-report-modes-test-fixture";
import { comparisonResponseFrom } from "#server/comparison-response-test-schema";
import ComparisonHarness from "#server/comparison-test-harness";

const EXPECTED_SESSION_ASSESSMENTS = {
	sessionAssessments: {
		"case-one": {
			basis: "checks",
			checks: {
				baseline: { assessed: 2, missing: 0, passed: 2, total: 2 },
			},
			stateChecks: {
				baseline: {
					assessed: 0,
					missing: 2,
					passRate: { state: "unavailable" },
					passed: 0,
					total: 2,
				},
			},
			title: "No observed difference in reply / transcript pass rates",
		},
	},
};

afterEach(clearComparisonRoots);

function registerTests(harness: Promise<ComparisonHarness>): void {
	registerGETApiComparisonsDigestRendersAQualityReadingForTheDiscussMeasurePerCasePerContrast(
		harness,
	);

	registerGETApiComparisonsDigestRendersAQualityReadingForEveryDeclaredStageMeasureAndInPipelineModeTheFinalRow(
		harness,
	);

	registerGETApiComparisonsDigestServesProjectedReplyCheckReadingsWithExplicitMissingStateCoverage(
		harness,
	);

	registerGETApiComparisonsDigestReadsASessionSChecksAsSuccessRateIntervalsRatherThanLetterSpans(
		harness,
	);

	registerGETApiComparisonsDigestRendersExactlyTheReportSThreeCanonicalContrastsPerCaseNotAllSixOrderedPairs(
		harness,
	);
}

describe("GET /api/comparisons/:digest", () => {
	const harness = Promise.withResolvers<ComparisonHarness>();
	beforeAll(async () => {
		await ComparisonHarness.setup().then(harness.resolve, harness.reject);
	});
	beforeEach(async () => {
		const ready = await harness.promise;
		await ready.reset();
	});
	afterAll(async () => {
		const ready = await harness.promise;
		await ready.teardown();
	});
	registerTests(harness.promise);
});

function registerGETApiComparisonsDigestRendersAQualityReadingForTheDiscussMeasurePerCasePerContrast(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"renders a quality reading for the discuss measure, per case per contrast",
		verifyGETApiComparisonsDigestRendersAQualityReadingForTheDiscussMeasurePerCasePerContrast,
	);
	async function verifyGETApiComparisonsDigestRendersAQualityReadingForTheDiscussMeasurePerCasePerContrast(): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const fixture = await writtenFixture(runsDirectory);

		const response = await driver.comparisonRaw(fixture.comparisonDigest);
		const body = await comparisonResponseFrom(response);

		expect(
			body.qualityReadings["case-1"]?.["candidateMinusBaseline"]?.["discuss"],
		).toEqual({
			interval: {
				minuend: { high: "A", low: "A" },
				subtrahend: { high: "A", low: "D" },
			},
			verdict: { kind: "insideRerunNoise" },
		});
		expect(
			body.qualityReadings["case-1"]?.["candidateMinusControl"]?.["discuss"],
		).toEqual({
			interval: {
				minuend: { high: "A", low: "A" },
				subtrahend: { high: "D", low: "D" },
			},
			verdict: { arm: "candidate", kind: "separated" },
		});
	}
}

function registerGETApiComparisonsDigestRendersAQualityReadingForEveryDeclaredStageMeasureAndInPipelineModeTheFinalRow(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"renders a quality reading for every declared-stage measure and, in pipeline mode, the final row",
		verifyGETApiComparisonsDigestRendersAQualityReadingForEveryDeclaredStageMeasureAndInPipelineModeTheFinalRow,
	);
	async function verifyGETApiComparisonsDigestRendersAQualityReadingForEveryDeclaredStageMeasureAndInPipelineModeTheFinalRow(): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const fixture = await writtenFixture(runsDirectory);

		const response = await driver.comparisonRaw(fixture.comparisonDigest);
		const body = await comparisonResponseFrom(response);
		const readings = body.qualityReadings["case-1"]?.["candidateMinusBaseline"];

		expect(Object.keys(readings ?? {}).toSorted()).toEqual([
			"build",
			"discuss",
			"final",
		]);
		expect(readings?.["build"]).toEqual({
			interval: {
				minuend: { high: "A", low: "A" },
				subtrahend: { high: "A", low: "D" },
			},
			verdict: { kind: "insideRerunNoise" },
		});
		expect(readings?.["final"]).toEqual({
			interval: {
				minuend: { high: "100%", low: "51%" },
				subtrahend: { high: "85%", low: "15%" },
			},
			verdict: { kind: "insideRerunNoise" },
		});
	}
}

function registerGETApiComparisonsDigestServesProjectedReplyCheckReadingsWithExplicitMissingStateCoverage(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"serves projected reply-check readings with explicit missing state coverage",
		verifyGETApiComparisonsDigestServesProjectedReplyCheckReadingsWithExplicitMissingStateCoverage,
	);
	async function verifyGETApiComparisonsDigestServesProjectedReplyCheckReadingsWithExplicitMissingStateCoverage(): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const fixture = await writtenFixture(runsDirectory);
		const sample = [
			{ costUsd: 1, elapsedMs: 10 },
			{ costUsd: 1, elapsedMs: 10 },
		];
		const report = buildComparisonReport(
			singleCaseSessionEvidenceFixture({
				baseline: sample,
				candidate: sample,
				control: sample,
			}),
			{ baselines: [], skippedCalibrations: 0 },
		);
		const { reportFile } = comparisonReportPaths(
			fixture.runsDirectory,
			fixture.comparisonDigest,
		);
		await Bun.write(reportFile, JSON.stringify(report));

		const response = await driver.comparisonRaw(fixture.comparisonDigest);

		expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
		expect(await response.json()).toMatchObject(EXPECTED_SESSION_ASSESSMENTS);
	}
}

function registerGETApiComparisonsDigestReadsASessionSChecksAsSuccessRateIntervalsRatherThanLetterSpans(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"reads a session's checks as success-rate intervals rather than letter spans",
		verifyGETApiComparisonsDigestReadsASessionSChecksAsSuccessRateIntervalsRatherThanLetterSpans,
	);
	async function verifyGETApiComparisonsDigestReadsASessionSChecksAsSuccessRateIntervalsRatherThanLetterSpans(): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const fixture = await writtenFixture(runsDirectory);
		await rewriteFixtureAsSession(fixture);

		const response = await driver.comparisonRaw(fixture.comparisonDigest);
		const body = await comparisonResponseFrom(response);

		expect(
			body.qualityReadings["case-1"]?.["candidateMinusBaseline"]?.["checks"]
				?.interval,
		).toEqual({
			minuend: { high: "100%", low: "51%" },
			subtrahend: { high: "85%", low: "15%" },
		});
	}
}

function registerGETApiComparisonsDigestRendersExactlyTheReportSThreeCanonicalContrastsPerCaseNotAllSixOrderedPairs(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"renders exactly the report's three canonical contrasts per case, not all six ordered pairs",
		verifyGETApiComparisonsDigestRendersExactlyTheReportSThreeCanonicalContrastsPerCaseNotAllSixOrderedPairs,
	);
	async function verifyGETApiComparisonsDigestRendersExactlyTheReportSThreeCanonicalContrastsPerCaseNotAllSixOrderedPairs(): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const fixture = await writtenFixture(runsDirectory);

		const response = await driver.comparisonRaw(fixture.comparisonDigest);
		const body = await comparisonResponseFrom(response);

		expect(Object.keys(body.attribution["case-1"] ?? {}).toSorted()).toEqual([
			"baselineMinusControl",
			"candidateMinusBaseline",
			"candidateMinusControl",
		]);
	}
}
