import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { mkdir } from "node:fs/promises";
import { constants as HTTP_STATUS } from "node:http2";

import { comparisonReportPaths } from "#benchmark/run-layout";
import {
	clearComparisonRoots,
	corruptDigest,
	fixtureWithUnreadableComparisons,
	missingReportDigest,
	unrecognizedReportDigest,
	writtenFixture,
} from "#server/comparison-endpoint-test-fixture";
import { comparisonIndexResponseSchema } from "#server/comparison-response-test-schema";
import ComparisonHarness from "#server/comparison-test-harness";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";

import comparisonIndex from "./comparison-index";
import type { ComparisonIndexEntry } from "./comparison-index";

afterEach(clearComparisonRoots);

const FIRST_LISTED_COMPARISON_INDEX = 0;

const FIRST_COMPARISON_DETAIL_INDEX = 0;

function expectedIndexDetails(): NonNullable<ComparisonIndexEntry["details"]> {
	const unavailable = {
		reasons: [
			"a group record could not be read: No saved attempt at this identity",
		],
		state: "unavailable" as const,
	};
	return ["case-1", "case-2"].map((caseId) => ({
		caseId,
		changedPaths: ["inputs/corpus/SKILL.md"],
		corpusVersions: {
			baseline: unavailable,
			candidate: unavailable,
			control: unavailable,
		},
	}));
}

function registerTests(harness: Promise<ComparisonHarness>): void {
	registerGETApiComparisonsListsEverySavedComparisonInDigestOrderEachWithItsModeCasesAndReps(
		harness,
	);

	registerGETApiComparisonsListsAnExtensionInPlaceOfTheComparisonItExtends(
		harness,
	);

	describe("when a comparison cannot be read", (): void => {
		registerGETApiComparisonsWhenAComparisonCannotBeReadListsItAsUnreadableWhileEveryReadableComparisonStillLists(
			harness,
		);

		registerGETApiComparisonsWhenAComparisonCannotBeReadGivesAReasonThatNamesNoAbsolutePath(
			harness,
		);

		registerGETApiComparisonsWhenAComparisonCannotBeReadNamesAReportNoKnownVersionMatchesInOneShortLine(
			harness,
		);
	});
}

describe(comparisonIndex.name, () => {
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
	registerComparisonIndexNameProjectsChangedPathsWithoutInventingUnavailableCorpusVersions(
		harness.promise,
	);
});

describe("GET /api/comparisons", () => {
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

function registerComparisonIndexNameProjectsChangedPathsWithoutInventingUnavailableCorpusVersions(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"projects changed paths without inventing unavailable corpus versions",
		verifyComparisonIndexNameProjectsChangedPathsWithoutInventingUnavailableCorpusVersions,
	);
	async function verifyComparisonIndexNameProjectsChangedPathsWithoutInventingUnavailableCorpusVersions(): Promise<void> {
		const { runsDirectory } = await harness;
		const fixture = await writtenFixture(runsDirectory);

		const index = await comparisonIndex(fixture.runsDirectory);

		expect(
			index.comparisons[FIRST_LISTED_COMPARISON_INDEX]?.details?.map(
				({ caseId, changedPaths }) => ({
					caseId,
					changedPaths,
				}),
			),
		).toEqual([
			{ caseId: "case-1", changedPaths: ["inputs/corpus/SKILL.md"] },
			{ caseId: "case-2", changedPaths: ["inputs/corpus/SKILL.md"] },
		]);

		const [observedFirstComparison] = index.comparisons;

		expect(
			observedFirstComparison?.details?.[FIRST_COMPARISON_DETAIL_INDEX]
				?.corpusVersions.baseline.state,
		).toBe("unavailable");
	}
}

function registerGETApiComparisonsListsEverySavedComparisonInDigestOrderEachWithItsModeCasesAndReps(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"lists every saved comparison in digest order, each with its mode, cases and reps",
		verifyGETApiComparisonsListsEverySavedComparisonInDigestOrderEachWithItsModeCasesAndReps,
	);
	async function verifyGETApiComparisonsListsEverySavedComparisonInDigestOrderEachWithItsModeCasesAndReps(): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const fixture = await writtenFixture(runsDirectory);
		const earlierDigest = "0".repeat(SHA256_HEX_DIGITS);
		const earlier = comparisonReportPaths(fixture.runsDirectory, earlierDigest);
		await mkdir(earlier.directory, { recursive: true });
		await Bun.write(
			earlier.reportFile,
			Bun.file(
				comparisonReportPaths(fixture.runsDirectory, fixture.comparisonDigest)
					.reportFile,
			),
		);

		const response = await driver.indexRaw();

		expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
		expect(await response.json()).toEqual({
			comparisons: [earlierDigest, fixture.comparisonDigest].map((digest) => ({
				caseIds: ["case-1", "case-2"],
				details: expectedIndexDetails(),
				digest,
				mode: "pipeline",
				reps: 4,
			})),
			unreadable: [],
		});
	}
}

function registerGETApiComparisonsListsAnExtensionInPlaceOfTheComparisonItExtends(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"lists an extension in place of the comparison it extends",
		verifyGETApiComparisonsListsAnExtensionInPlaceOfTheComparisonItExtends,
	);
	async function verifyGETApiComparisonsListsAnExtensionInPlaceOfTheComparisonItExtends(): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const fixture = await writtenFixture(runsDirectory);
		const extension = await fixture.comparisons.recordExtension();

		const response = await driver.indexRaw();

		expect(await response.json()).toEqual({
			comparisons: [
				{
					caseIds: ["case-1", "case-2"],
					details: expectedIndexDetails(),
					digest: extension,
					mode: "pipeline",
					reps: 4,
				},
			],
			unreadable: [],
		});
	}
}

function registerGETApiComparisonsWhenAComparisonCannotBeReadListsItAsUnreadableWhileEveryReadableComparisonStillLists(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"lists it as unreadable while every readable comparison still lists",
		verifyGETApiComparisonsWhenAComparisonCannotBeReadListsItAsUnreadableWhileEveryReadableComparisonStillLists,
	);
	async function verifyGETApiComparisonsWhenAComparisonCannotBeReadListsItAsUnreadableWhileEveryReadableComparisonStillLists(): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const fixture = await fixtureWithUnreadableComparisons(runsDirectory);

		const response = await driver.indexRaw();

		expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);

		const index = comparisonIndexResponseSchema.parse(await response.json());

		expect(index.comparisons.map(({ digest }) => digest)).toEqual([
			fixture.comparisonDigest,
		]);
		expect(index.unreadable.map(({ id }) => id)).toEqual([
			corruptDigest,
			missingReportDigest,
			unrecognizedReportDigest,
		]);
		expect(index.unreadable.filter(({ reason }) => reason === "")).toEqual([]);
	}
}

function registerGETApiComparisonsWhenAComparisonCannotBeReadGivesAReasonThatNamesNoAbsolutePath(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"gives a reason that names no absolute path",
		verifyGETApiComparisonsWhenAComparisonCannotBeReadGivesAReasonThatNamesNoAbsolutePath,
	);
	async function verifyGETApiComparisonsWhenAComparisonCannotBeReadGivesAReasonThatNamesNoAbsolutePath(): Promise<void> {
		const { driver, runsDirectory } = await harness;
		await fixtureWithUnreadableComparisons(runsDirectory);

		const response = await driver.indexRaw();

		const { unreadable } = comparisonIndexResponseSchema.parse(
			await response.json(),
		);

		expect(unreadable.map(({ id }) => id)).toContain(missingReportDigest);
		expect(JSON.stringify(unreadable)).not.toMatch(
			/\/(?:Users|home|var|tmp)\//u,
		);
	}
}

function registerGETApiComparisonsWhenAComparisonCannotBeReadNamesAReportNoKnownVersionMatchesInOneShortLine(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"names a report no known version matches in one short line",
		verifyGETApiComparisonsWhenAComparisonCannotBeReadNamesAReportNoKnownVersionMatchesInOneShortLine,
	);
	async function verifyGETApiComparisonsWhenAComparisonCannotBeReadNamesAReportNoKnownVersionMatchesInOneShortLine(): Promise<void> {
		const { driver, runsDirectory } = await harness;
		await fixtureWithUnreadableComparisons(runsDirectory);

		const response = await driver.indexRaw();

		const { unreadable } = comparisonIndexResponseSchema.parse(
			await response.json(),
		);

		expect(
			unreadable.find(({ id }) => id === unrecognizedReportDigest),
		).toEqual({
			id: unrecognizedReportDigest,
			reason: "report.json matches no known comparison report",
		});
	}
}
