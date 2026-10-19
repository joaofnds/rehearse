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
import { join } from "node:path";

import { z } from "zod";

import type { JsonValue } from "#benchmark/json-value";
import { comparisonReportPaths } from "#benchmark/run-layout";
import {
	clearComparisonRoots,
	writtenFixture,
} from "#server/comparison-endpoint-test-fixture";
import { baselineArmResponseSchema } from "#server/comparison-response-test-schema";
import ComparisonHarness from "#server/comparison-test-harness";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";

afterEach(clearComparisonRoots);

const BASELINE_RECORDS = [
	[
		"as compare attempts writes it",
		{
			arms: {
				baseline: "case-1-a",
				candidate: "case-1-b",
				control: "case-1-derived",
			},
			controlCorpus: "0".repeat(SHA256_HEX_DIGITS),
			kind: "derived",
			schemaVersion: 2,
			skillUnderTest: "skills/build/",
		},
	],
	[
		"as compare attempts first wrote it",
		{
			arms: {
				baseline: "case-1-a",
				candidate: "case-1-b",
				control: "case-1-derived",
			},
			baselineCorpus: "0".repeat(SHA256_HEX_DIGITS),
			kind: "derived",
			schemaVersion: 1,
			skillUnderTest: "skills/build/",
		},
	],
] as const;

function registerTests(harness: Promise<ComparisonHarness>): void {
	registerGETApiComparisonsDigestNamesAManifestSuppliedControlAsSuppliedNeverAsTheSkillUnderTestRemoved(
		harness,
	);

	registerDerivedBaseline(harness);

	registerUnreadableBaseline(harness);
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

function registerGETApiComparisonsDigestNamesAManifestSuppliedControlAsSuppliedNeverAsTheSkillUnderTestRemoved(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"names a manifest-supplied control as supplied, never as the skill under test removed",
		verifyGETApiComparisonsDigestNamesAManifestSuppliedControlAsSuppliedNeverAsTheSkillUnderTestRemoved,
	);
	async function verifyGETApiComparisonsDigestNamesAManifestSuppliedControlAsSuppliedNeverAsTheSkillUnderTestRemoved(): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const fixture = await writtenFixture(runsDirectory);

		const response = await driver.comparisonRaw(fixture.comparisonDigest);

		expect(baselineArmResponseSchema.parse(await response.json())).toEqual({
			baselineArm: { kind: "supplied" },
		});
	}
}

function registerDerivedBaseline(harness: Promise<ComparisonHarness>): void {
	it.each(BASELINE_RECORDS)(
		"names a baseline arm derived from arm A with the skill under test, recorded %s",
		verifyDerivedBaseline,
	);
	async function verifyDerivedBaseline(
		_label: string,
		record: JsonValue,
	): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const fixture = await writtenFixture(runsDirectory);
		await Bun.write(
			join(
				comparisonReportPaths(fixture.runsDirectory, fixture.comparisonDigest)
					.directory,
				"baseline.json",
			),
			JSON.stringify(record),
		);

		const response = await driver.comparisonRaw(fixture.comparisonDigest);

		expect(baselineArmResponseSchema.parse(await response.json())).toEqual({
			baselineArm: { kind: "derived", skillUnderTest: "skills/build/" },
		});
	}
}

function registerUnreadableBaseline(harness: Promise<ComparisonHarness>): void {
	it.each([
		{ content: "{ torn", record: "torn JSON" },
		{ content: '{"schemaVersion":3}\n', record: "a record of another shape" },
	])(
		"serves the report and names $record as an unreadable baseline record",
		verifyUnreadableBaseline,
	);
	async function verifyUnreadableBaseline({
		content,
	}: Readonly<{ content: string }>): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const fixture = await writtenFixture(runsDirectory);
		await Bun.write(
			join(
				comparisonReportPaths(fixture.runsDirectory, fixture.comparisonDigest)
					.directory,
				"baseline.json",
			),
			content,
		);

		const response = await driver.comparisonRaw(fixture.comparisonDigest);

		const { baselineArm } = z
			.object({
				baselineArm: z.object({ kind: z.string(), reason: z.string() }),
			})
			.parse(await response.json());

		expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
		expect(baselineArm.kind).toBe("unreadable");
		expect(baselineArm.reason).toStartWith(
			"baseline.json is not a baseline record: ",
		);
	}
}
