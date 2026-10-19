import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { unlink } from "node:fs/promises";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import { z } from "zod";

import { CASE_ID, groupIdFor } from "#benchmark/compare-attempts-test-support";
import {
	clearArmDiffRoots,
	comparedArms,
} from "#server/comparison-arm-diff-test-fixture";
import ComparisonHarness from "#server/comparison-test-harness";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";

import { MISMATCHED_FROZEN_COPY_REASON } from "./comparison-arm-diff";

afterEach(clearArmDiffRoots);

const unavailableFileSchema = z.object({
	reasons: z.array(z.string()),
	state: z.literal("unavailable"),
});

const fileTextSchema = z.discriminatedUnion("state", [
	z.object({ state: z.literal("available"), text: z.string() }),
	z.object({ state: z.literal("absent") }),
	unavailableFileSchema,
]);

const differingFileSchema = z.object({
	baseline: fileTextSchema,
	candidate: fileTextSchema,
	path: z.string(),
});

const armDiffSchema = z.record(z.string(), z.array(differingFileSchema));

async function differingFiles(
	response: Response,
): Promise<z.infer<typeof armDiffSchema>[string]> {
	const body = armDiffSchema.parse(await response.json());

	return body[CASE_ID] ?? [];
}

async function frozenCopy(
	runsDirectory: string,
	role: "baseline" | "candidate",
	layoutPath: string,
): Promise<string> {
	const glob = new Bun.Glob(
		`confirmations/${groupIdFor(role)}/inputs/corpus/**/${layoutPath}`,
	);
	const [found] = await Array.fromAsync(glob.scan({ cwd: runsDirectory }));
	if (found === undefined) {
		throw new Error(`No frozen copy of ${layoutPath} for arm ${role}`);
	}

	return join(runsDirectory, found);
}

const SKILL = "skills/build/SKILL.md";

function registerTests(harness: Promise<ComparisonHarness>): void {
	registerGETApiComparisonsDigestArmDiffServesEachFileThatDiffersBetweenArmsAAndBAtTheTextEachArmFroze(
		harness,
	);

	registerGETApiComparisonsDigestArmDiffReadsAFileOnlyOneArmRanAsAbsentFromTheOther(
		harness,
	);

	registerGETApiComparisonsDigestArmDiffSaysAnArmSTextIsUnavailableWhenItsFrozenCopyNoLongerMatchesTheRecordedDigest(
		harness,
	);

	registerGETApiComparisonsDigestArmDiffSaysWhyAnArmSTextIsUnavailableWhenItsFrozenCopyIsGone(
		harness,
	);

	describe("when no comparison is recorded for the digest", () => {
		registerGETApiComparisonsDigestArmDiffWhenNoComparisonIsRecordedForTheDigestRefusesWith404(
			harness,
		);
	});
}

describe("GET /api/comparisons/:digest/arm-diff", () => {
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

function registerGETApiComparisonsDigestArmDiffServesEachFileThatDiffersBetweenArmsAAndBAtTheTextEachArmFroze(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"serves each file that differs between arms A and B at the text each arm froze",
		verifyGETApiComparisonsDigestArmDiffServesEachFileThatDiffersBetweenArmsAAndBAtTheTextEachArmFroze,
	);
	async function verifyGETApiComparisonsDigestArmDiffServesEachFileThatDiffersBetweenArmsAAndBAtTheTextEachArmFroze(): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const { digest } = await comparedArms({
			armA: { [SKILL]: "build\n" },
			armB: { [SKILL]: "revised build\n" },
			runsDirectory,
		});

		const response = await driver.armDiffRaw(digest);

		expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
		expect(await differingFiles(response)).toContainEqual({
			baseline: {
				state: "available",
				text: await Bun.file(
					await frozenCopy(runsDirectory, "baseline", SKILL),
				).text(),
			},
			candidate: {
				state: "available",
				text: await Bun.file(
					await frozenCopy(runsDirectory, "candidate", SKILL),
				).text(),
			},
			path: SKILL,
		});
	}
}

function registerGETApiComparisonsDigestArmDiffReadsAFileOnlyOneArmRanAsAbsentFromTheOther(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"reads a file only one arm ran as absent from the other",
		verifyGETApiComparisonsDigestArmDiffReadsAFileOnlyOneArmRanAsAbsentFromTheOther,
	);
	async function verifyGETApiComparisonsDigestArmDiffReadsAFileOnlyOneArmRanAsAbsentFromTheOther(): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const notes = "skills/build/notes.md";
		const { digest } = await comparedArms({
			armA: { [SKILL]: "build\n" },
			armB: { [SKILL]: "revised build\n" },
			readOnlyByArmB: [notes],
			runsDirectory,
		});

		const response = await driver.armDiffRaw(digest);

		expect(await differingFiles(response)).toContainEqual({
			baseline: { state: "absent" },
			candidate: {
				state: "available",
				text: await Bun.file(
					await frozenCopy(runsDirectory, "candidate", notes),
				).text(),
			},
			path: notes,
		});
	}
}

function registerGETApiComparisonsDigestArmDiffSaysAnArmSTextIsUnavailableWhenItsFrozenCopyNoLongerMatchesTheRecordedDigest(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"says an arm's text is unavailable when its frozen copy no longer matches the recorded digest",
		verifyGETApiComparisonsDigestArmDiffSaysAnArmSTextIsUnavailableWhenItsFrozenCopyNoLongerMatchesTheRecordedDigest,
	);
	async function verifyGETApiComparisonsDigestArmDiffSaysAnArmSTextIsUnavailableWhenItsFrozenCopyNoLongerMatchesTheRecordedDigest(): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const { digest } = await comparedArms({
			armA: { [SKILL]: "build\n" },
			armB: { [SKILL]: "revised build\n" },
			runsDirectory,
		});
		await Bun.write(
			await frozenCopy(runsDirectory, "candidate", SKILL),
			"edited after the run\n",
		);

		const response = await driver.armDiffRaw(digest);

		const files = await differingFiles(response);
		const skill = files.find(({ path }) => path === SKILL);

		expect(skill?.candidate).toEqual({
			reasons: [MISMATCHED_FROZEN_COPY_REASON],
			state: "unavailable",
		});
	}
}

function registerGETApiComparisonsDigestArmDiffSaysWhyAnArmSTextIsUnavailableWhenItsFrozenCopyIsGone(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"says why an arm's text is unavailable when its frozen copy is gone",
		verifyGETApiComparisonsDigestArmDiffSaysWhyAnArmSTextIsUnavailableWhenItsFrozenCopyIsGone,
	);
	async function verifyGETApiComparisonsDigestArmDiffSaysWhyAnArmSTextIsUnavailableWhenItsFrozenCopyIsGone(): Promise<void> {
		const { driver, runsDirectory } = await harness;
		const { digest } = await comparedArms({
			armA: { [SKILL]: "build\n" },
			armB: { [SKILL]: "revised build\n" },
			runsDirectory,
		});
		await unlink(await frozenCopy(runsDirectory, "candidate", SKILL));

		const response = await driver.armDiffRaw(digest);

		const files = await differingFiles(response);
		const skill = files.find(({ path }) => path === SKILL);
		const { reasons } = z
			.object({
				reasons: z.tuple([z.string()]),
				state: z.literal("unavailable"),
			})
			.parse(skill?.candidate);
		const [observedFirstReason] = reasons;

		expect(observedFirstReason).toMatch(/^its frozen copy cannot be read: /u);
	}
}

function registerGETApiComparisonsDigestArmDiffWhenNoComparisonIsRecordedForTheDigestRefusesWith404(
	harness: Promise<ComparisonHarness>,
): void {
	it(
		"refuses with 404",
		verifyGETApiComparisonsDigestArmDiffWhenNoComparisonIsRecordedForTheDigestRefusesWith404,
	);
	async function verifyGETApiComparisonsDigestArmDiffWhenNoComparisonIsRecordedForTheDigestRefusesWith404(): Promise<void> {
		const { driver } = await harness;

		const response = await driver.armDiffRaw("e".repeat(SHA256_HEX_DIGITS));

		expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_NOT_FOUND);
	}
}
