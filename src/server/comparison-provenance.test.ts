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

import {
	CASE_ID,
	REPLAYED,
	groupIdFor,
} from "#benchmark/compare-attempts-test-support";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import { RecordedRunsFixture } from "#benchmark/run-records-test-support";
import { claimShortId, formatShortId } from "#benchmark/short-id";
import {
	clearProvenanceRoots,
	comparedArms,
	lock,
	recordedVersionDigest,
} from "#server/comparison-provenance-test-fixture";
import ComparisonHarness from "#server/comparison-test-harness";

const unavailableReadingSchema = z.object({
	reasons: z.array(z.string()),
	state: z.literal("unavailable"),
});

const readingSchema = z.discriminatedUnion("state", [
	z.object({ state: z.literal("available") }).loose(),
	unavailableReadingSchema,
]);

const caseReadingsSchema = z.record(z.string(), readingSchema);

const provenanceSchema = z.object({
	checkpoint: readingSchema,
	corpusVersions: z.record(z.string(), caseReadingsSchema),
});

afterEach(clearProvenanceRoots);

function registerTests(harness: Promise<ComparisonHarness>): void {
	registerGETApiComparisonsDigestServesTheCheckpointEveryArmOfAOneCheckpointStageComparisonReplayed(
		harness,
	);

	registerGETApiComparisonsDigestNamesThatCheckpointByItsShortIdOnceItsRunHoldsOne(
		harness,
	);

	registerGETApiComparisonsDigestServesTheCorpusVersionEachArmSGroupsRecorded(
		harness,
	);

	registerGETApiComparisonsDigestNamesNoCheckpointForAPipelineComparisonWhichReplaysNone(
		harness,
	);

	describe("when an arm's records cannot be read", () => {
		registerGETApiComparisonsDigestWhenAnArmSRecordsCannotBeReadNamesNoCheckpointWhenAGroupRecordNoLongerParses(
			harness,
		);

		registerGETApiComparisonsDigestWhenAnArmSRecordsCannotBeReadServesTheComparisonWithTheCheckpointUnavailableWhenTheCaseSClaimsCannotBeListed(
			harness,
		);

		registerGETApiComparisonsDigestWhenAnArmSRecordsCannotBeReadServesTheComparisonWithAnArmSVersionUnavailableWhenItsGroupRecordCannotBeOpened(
			harness,
		);
	});
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

function registerGETApiComparisonsDigestServesTheCheckpointEveryArmOfAOneCheckpointStageComparisonReplayed(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"serves the checkpoint every arm of a one-checkpoint stage comparison replayed",
		verifyGETApiComparisonsDigestServesTheCheckpointEveryArmOfAOneCheckpointStageComparisonReplayed,
	);
	async function verifyGETApiComparisonsDigestServesTheCheckpointEveryArmOfAOneCheckpointStageComparisonReplayed(): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const { digest } = await comparedArms(runsDirectory);

		const response = await driver.comparisonRaw(digest);

		expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);

		const { checkpoint } = provenanceSchema.parse(await response.json());

		expect(checkpoint).toEqual({ state: "available", ...REPLAYED });
	}
}

function registerGETApiComparisonsDigestNamesThatCheckpointByItsShortIdOnceItsRunHoldsOne(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"names that checkpoint by its short id once its run holds one",
		verifyGETApiComparisonsDigestNamesThatCheckpointByItsShortIdOnceItsRunHoldsOne,
	);
	async function verifyGETApiComparisonsDigestNamesThatCheckpointByItsShortIdOnceItsRunHoldsOne(): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const { digest } = await comparedArms(runsDirectory);
		const run = await claimShortId(runsDirectory, CASE_ID, {
			kind: "run",
			run: REPLAYED.run,
		});

		const response = await driver.comparisonRaw(digest);

		expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);

		const { checkpoint } = provenanceSchema.parse(await response.json());

		expect(checkpoint).toEqual({
			state: "available",
			...REPLAYED,
			shortId: `${formatShortId(run)}/s2`,
		});
	}
}

function registerGETApiComparisonsDigestServesTheCorpusVersionEachArmSGroupsRecorded(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"serves the corpus version each arm's groups recorded",
		verifyGETApiComparisonsDigestServesTheCorpusVersionEachArmSGroupsRecorded,
	);
	async function verifyGETApiComparisonsDigestServesTheCorpusVersionEachArmSGroupsRecorded(): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const { digest } = await comparedArms(runsDirectory);

		const response = await driver.comparisonRaw(digest);

		expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);

		const { corpusVersions } = provenanceSchema.parse(await response.json());

		expect(corpusVersions[CASE_ID]).toEqual({
			baseline: {
				digest: await recordedVersionDigest(
					runsDirectory,
					groupIdFor("baseline"),
				),
				state: "available",
			},
			candidate: {
				digest: await recordedVersionDigest(
					runsDirectory,
					groupIdFor("candidate"),
				),
				state: "available",
			},
			control: { reasons: ["version not recorded"], state: "unavailable" },
		});
	}
}

function registerGETApiComparisonsDigestNamesNoCheckpointForAPipelineComparisonWhichReplaysNone(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"names no checkpoint for a pipeline comparison, which replays none",
		verifyGETApiComparisonsDigestNamesNoCheckpointForAPipelineComparisonWhichReplaysNone,
	);
	async function verifyGETApiComparisonsDigestNamesNoCheckpointForAPipelineComparisonWhichReplaysNone(): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const fixture = new RecordedRunsFixture(runsDirectory);
		await fixture.write();

		const response = await driver.comparisonRaw(fixture.comparisonDigest);

		expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);

		const { checkpoint } = provenanceSchema.parse(await response.json());

		expect(checkpoint).toEqual({
			reasons: ["a pipeline comparison replays no single checkpoint"],
			state: "unavailable",
		});
	}
}

function registerGETApiComparisonsDigestWhenAnArmSRecordsCannotBeReadNamesNoCheckpointWhenAGroupRecordNoLongerParses(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"names no checkpoint when a group record no longer parses",
		verifyGETApiComparisonsDigestWhenAnArmSRecordsCannotBeReadNamesNoCheckpointWhenAGroupRecordNoLongerParses,
	);
	async function verifyGETApiComparisonsDigestWhenAnArmSRecordsCannotBeReadNamesNoCheckpointWhenAGroupRecordNoLongerParses(): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const { digest } = await comparedArms(runsDirectory);
		await Bun.write(
			confirmationGroupPaths(runsDirectory, groupIdFor("baseline")).groupFile,
			"{}\n",
		);

		const response = await driver.comparisonRaw(digest);

		expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);

		const { checkpoint } = provenanceSchema.parse(await response.json());

		expect(checkpoint.state).toBe("unavailable");
	}
}

function registerGETApiComparisonsDigestWhenAnArmSRecordsCannotBeReadServesTheComparisonWithTheCheckpointUnavailableWhenTheCaseSClaimsCannotBeListed(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"serves the comparison with the checkpoint unavailable when the case's claims cannot be listed",
		verifyGETApiComparisonsDigestWhenAnArmSRecordsCannotBeReadServesTheComparisonWithTheCheckpointUnavailableWhenTheCaseSClaimsCannotBeListed,
	);
	async function verifyGETApiComparisonsDigestWhenAnArmSRecordsCannotBeReadServesTheComparisonWithTheCheckpointUnavailableWhenTheCaseSClaimsCannotBeListed(): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const { digest } = await comparedArms(runsDirectory);
		await lock(join(runsDirectory, "short-ids", CASE_ID, "claims"));

		const response = await driver.comparisonRaw(digest);

		expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);

		const { checkpoint } = provenanceSchema.parse(await response.json());

		expect(checkpoint).toEqual({
			reasons: [
				`the short ids of ${CASE_ID} could not be read: EACCES: permission denied, scandir '<path>'`,
			],
			state: "unavailable",
		});
	}
}

function registerGETApiComparisonsDigestWhenAnArmSRecordsCannotBeReadServesTheComparisonWithAnArmSVersionUnavailableWhenItsGroupRecordCannotBeOpened(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"serves the comparison with an arm's version unavailable when its group record cannot be opened",
		verifyGETApiComparisonsDigestWhenAnArmSRecordsCannotBeReadServesTheComparisonWithAnArmSVersionUnavailableWhenItsGroupRecordCannotBeOpened,
	);
	async function verifyGETApiComparisonsDigestWhenAnArmSRecordsCannotBeReadServesTheComparisonWithAnArmSVersionUnavailableWhenItsGroupRecordCannotBeOpened(): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const { digest } = await comparedArms(runsDirectory);
		await lock(
			confirmationGroupPaths(runsDirectory, groupIdFor("candidate")).groupFile,
		);

		const response = await driver.comparisonRaw(digest);

		expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);

		const { corpusVersions } = provenanceSchema.parse(await response.json());

		expect(corpusVersions[CASE_ID]?.["candidate"]).toEqual({
			reasons: [
				"a group record could not be read: EACCES: permission denied, lstat '<path>'",
			],
			state: "unavailable",
		});
	}
}
