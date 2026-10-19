import { describe, expect, it } from "bun:test";
import { symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { CorpusMeasurement } from "./corpus-measurement";
import { readCorpusUnderTest } from "./corpus-version";
import {
	SHA256_HEX_DIGITS,
	createVersionWorkspace,
} from "./corpus-version-test-fixtures";

const { measureWith, recordsDirectory, scratch, source } =
	createVersionWorkspace();

async function putsARecordMeasuredOnTheCorpusUnderTestAtDistance0(): Promise<void> {
	const digest = await measureWith("brief\n");

	const underTest = await readCorpusUnderTest(recordsDirectory, source);

	expect(underTest.distanceOf({ digest, kind: "version" })).toEqual({
		kind: "measured",
		versions: 0,
	});
}

async function countsAnEditNotYetMeasuredAsOneVersionPastTheLatestEntry(): Promise<void> {
	const digest = await measureWith("brief\n");
	await writeFile(join(source.root, "output-styles", "brief.md"), "edited\n");

	const underTest = await readCorpusUnderTest(recordsDirectory, source);

	expect(underTest.distanceOf({ digest, kind: "version" })).toEqual({
		kind: "measured",
		versions: 1,
	});
}

async function namesTheVersionItHashedTheCorpusUnderTestAsMeasuredOrNot(): Promise<void> {
	await measureWith("brief\n");
	await writeFile(join(source.root, "output-styles", "brief.md"), "edited\n");

	const underTest = await readCorpusUnderTest(recordsDirectory, source);

	expect(underTest.version).toBe(await measureWith("edited\n"));
}

async function countsMeasuredVersionsBetweenTheRecordSAndTheCorpusUnderTest(): Promise<void> {
	const first = await measureWith("brief\n");
	await measureWith("second\n");
	await measureWith("third\n");

	const underTest = await readCorpusUnderTest(recordsDirectory, source);

	expect(underTest.distanceOf({ digest: first, kind: "version" })).toEqual({
		kind: "measured",
		versions: 2,
	});
}

async function measuresARevertedVersionFromItsLatestPositionInTheLog(): Promise<void> {
	const first = await measureWith("brief\n");
	const second = await measureWith("second\n");
	await measureWith("brief\n");
	await measureWith("third\n");

	const underTest = await readCorpusUnderTest(recordsDirectory, source);

	expect([
		underTest.distanceOf({ digest: first, kind: "version" }),
		underTest.distanceOf({ digest: second, kind: "version" }),
	]).toEqual([
		{ kind: "measured", versions: 1 },
		{ kind: "measured", versions: 2 },
	]);
}

async function readsNotRecordedNamingTheRefusalWhenTheCorpusUnderTestIsRefused(): Promise<void> {
	const digest = await measureWith("brief\n");
	const outside = join(scratch, "outside.md");
	await writeFile(outside, "outside\n");
	await symlink(outside, join(source.root, "output-styles", "escape.md"));

	const underTest = await readCorpusUnderTest(recordsDirectory, source);

	expect(underTest.distanceOf({ digest, kind: "version" })).toEqual({
		kind: "not-recorded",
		reason:
			"the corpus under test refused: output-styles/escape.md resolves outside the tree it is named under, so its bytes are not the ones that tree holds",
	});
}

const UNMEASURED_VERSIONS = [
	["no version", undefined, "recorded before corpus versions"],
	[
		"a refusal",
		{ kind: "refused", refusal: "skills links out" } as const,
		"the attempt measured no version: skills links out",
	],
	[
		"a version this corpus's log never held",
		{ digest: "0".repeat(SHA256_HEX_DIGITS), kind: "version" } as const,
		"its version is not in the log of the corpus under test",
	],
] satisfies readonly (readonly [
	string,
	CorpusMeasurement | undefined,
	string,
])[];

describe(readCorpusUnderTest.name, () => {
	it(
		"puts a record measured on the corpus under test at distance 0",
		putsARecordMeasuredOnTheCorpusUnderTestAtDistance0,
	);
	it(
		"counts an edit not yet measured as one version past the latest entry",
		countsAnEditNotYetMeasuredAsOneVersionPastTheLatestEntry,
	);
	it(
		"names the version it hashed the corpus under test as, measured or not",
		namesTheVersionItHashedTheCorpusUnderTestAsMeasuredOrNot,
	);
	it(
		"counts measured versions between the record's and the corpus under test",
		countsMeasuredVersionsBetweenTheRecordSAndTheCorpusUnderTest,
	);
	it(
		"measures a reverted version from its latest position in the log",
		measuresARevertedVersionFromItsLatestPositionInTheLog,
	);

	describe("when the record's distance cannot be measured", () => {
		it.each(UNMEASURED_VERSIONS)(
			"reads not recorded for a record with %s",
			async (_holding, measurement, reason) => {
				await measureWith("brief\n");

				const underTest = await readCorpusUnderTest(recordsDirectory, source);

				expect(underTest.distanceOf(measurement)).toEqual({
					kind: "not-recorded",
					reason,
				});
			},
		);
		it(
			"reads not recorded, naming the refusal, when the corpus under test is refused",
			readsNotRecordedNamingTheRefusalWhenTheCorpusUnderTestIsRefused,
		);
	});
});
