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

import {
	clearComparisonRoots,
	writtenFixture,
} from "#server/comparison-endpoint-test-fixture";
import {
	JUDGE_AGREEMENT_COMPARISON_REPORT_VERSION,
	LEGACY_COMPARISON_REPORT_VERSION,
	MULTIPLE_GROUP_COMPARISON_REPORT_VERSION,
	rewriteFixtureAsLegacyPipeline,
	rewriteFixtureAsSession,
} from "#server/comparison-report-modes-test-fixture";
import { comparisonResponseFrom } from "#server/comparison-response-test-schema";
import ComparisonHarness from "#server/comparison-test-harness";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";

const EXPECTED_RECORDED_OUTCOMES = [
	{
		grade: "A",
		name: "discuss",
		status: "JUDGED",
		successful: true,
	},
	{
		grade: "A",
		name: "build",
		status: "JUDGED",
		successful: true,
	},
	{
		grade: "PASS",
		name: "final",
		status: "JUDGED",
		successful: true,
	},
];

const EXPECTED_CASE_IDS = ["case-1", "case-2"];

afterEach(clearComparisonRoots);

const FIRST_SOURCE_REP_INDEX = 0;

function registerTests(harness: Promise<ComparisonHarness>): void {
	registerGETApiComparisonsDigestRendersTheRecordedReportPlusAttributionForEveryCaseAndContrast(
		harness,
	);

	registerCaseContrastAttribution(harness);

	registerGETApiComparisonsDigestUsesSessionModeLayoutPathsInThePublicResponse(
		harness,
	);

	registerServesAVersionIPipelineReportThroughThePublicAPI(harness);

	registerGETApiComparisonsDigestRefusesADigestWhoseSegmentEscapesTheRunsDirectoryWithoutA500(
		harness,
	);

	registerGETApiComparisonsDigestRefusesADigestThatNamesNoRecordedComparisonWithoutA500(
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

function registerGETApiComparisonsDigestRendersTheRecordedReportPlusAttributionForEveryCaseAndContrast(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"renders the recorded report plus attribution for every case and contrast",
		verifyGETApiComparisonsDigestRendersTheRecordedReportPlusAttributionForEveryCaseAndContrast,
	);
	async function verifyGETApiComparisonsDigestRendersTheRecordedReportPlusAttributionForEveryCaseAndContrast(): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const fixture = await writtenFixture(runsDirectory);

		const response = await driver.comparisonRaw(fixture.comparisonDigest);
		const body = await comparisonResponseFrom(response);

		expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
		expect(body.report.schemaVersion).toBe(
			MULTIPLE_GROUP_COMPARISON_REPORT_VERSION,
		);

		expect(body.report.cases.map(({ caseId }) => caseId)).toEqual(
			EXPECTED_CASE_IDS,
		);

		const [observedFirstCase] = body.report.cases;

		expect(observedFirstCase).toHaveProperty(
			[
				"arms",
				"baseline",
				"source",
				"reps",
				FIRST_SOURCE_REP_INDEX,
				"outcomes",
			],
			EXPECTED_RECORDED_OUTCOMES,
		);
	}
}

function registerCaseContrastAttribution(
	harness: Promise<ComparisonHarness>,
): void {
	it.each(["case-1", "case-2"])(
		"renders attribution for %s and every canonical contrast",
		verifyCaseContrastAttribution,
	);
	async function verifyCaseContrastAttribution(caseId: string): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const fixture = await writtenFixture(runsDirectory);

		const response = await driver.comparisonRaw(fixture.comparisonDigest);
		const body = await comparisonResponseFrom(response);

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
}

function registerGETApiComparisonsDigestUsesSessionModeLayoutPathsInThePublicResponse(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"uses session-mode layout paths in the public response",
		verifyGETApiComparisonsDigestUsesSessionModeLayoutPathsInThePublicResponse,
	);
	async function verifyGETApiComparisonsDigestUsesSessionModeLayoutPathsInThePublicResponse(): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const fixture = await writtenFixture(runsDirectory);
		await rewriteFixtureAsSession(fixture);

		const response = await driver.comparisonRaw(fixture.comparisonDigest);
		const body = await comparisonResponseFrom(response);

		expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
		expect(body.report.mode).toBe("session");
		expect(body.attribution["case-1"]?.["candidateMinusBaseline"]).toEqual({
			claim: "attributable",
			differingPath: "output-styles/brief.md",
			differingPaths: ["output-styles/brief.md"],
		});
	}
}

function registerServesAVersionIPipelineReportThroughThePublicAPI(
	harness: Promise<ComparisonHarness>,
): void {
	it.each(
		(
			[
				LEGACY_COMPARISON_REPORT_VERSION,
				JUDGE_AGREEMENT_COMPARISON_REPORT_VERSION,
			] as const
		).map((version) => [version] as const),
	)(
		"serves a version-%i pipeline report through the public API",
		verifyServesAVersionIPipelineReportThroughThePublicAPI,
	);
	async function verifyServesAVersionIPipelineReportThroughThePublicAPI(
		version:
			| typeof LEGACY_COMPARISON_REPORT_VERSION
			| typeof JUDGE_AGREEMENT_COMPARISON_REPORT_VERSION,
	): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const fixture = await writtenFixture(runsDirectory);
		await rewriteFixtureAsLegacyPipeline(fixture, version);

		const response = await driver.comparisonRaw(fixture.comparisonDigest);
		const body = await comparisonResponseFrom(response);

		expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
		expect(body.report.schemaVersion).toBe(version);
		expect(body.report.mode).toBe("pipeline");
	}
}

function registerGETApiComparisonsDigestRefusesADigestWhoseSegmentEscapesTheRunsDirectoryWithoutA500(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"refuses a digest whose segment escapes the runs directory, without a 500",
		verifyGETApiComparisonsDigestRefusesADigestWhoseSegmentEscapesTheRunsDirectoryWithoutA500,
	);
	async function verifyGETApiComparisonsDigestRefusesADigestWhoseSegmentEscapesTheRunsDirectoryWithoutA500(): Promise<void> {
		const { driver } = await harness;

		const response = await driver.comparisonRaw("../../etc/passwd");

		expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_BAD_REQUEST);
	}
}

function registerGETApiComparisonsDigestRefusesADigestThatNamesNoRecordedComparisonWithoutA500(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"refuses a digest that names no recorded comparison, without a 500",
		verifyGETApiComparisonsDigestRefusesADigestThatNamesNoRecordedComparisonWithoutA500,
	);
	async function verifyGETApiComparisonsDigestRefusesADigestThatNamesNoRecordedComparisonWithoutA500(): Promise<void> {
		const { driver } = await harness;

		const response = await driver.comparisonRaw("9".repeat(SHA256_HEX_DIGITS));

		expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_NOT_FOUND);
	}
}
