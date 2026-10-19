import { describe, expect, it } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	comparisonBaselineRecordFile,
	readComparisonBaselineRecord,
	writeComparisonBaselineRecord,
} from "./comparison-baseline-record";
import { TestResources } from "./test-support";

const SHA256_HEX_CHARACTER_COUNT = 64;

const resources = TestResources.forEachTest();

const SHA256_HEX_CHARACTERS = 64;
const LEGACY_BASELINE_CORPUS_FIXTURE_VERSION = 1;
const LEGACY_CONTROL_CORPUS_FIXTURE_VERSION = 2;

const CORPUS = "c".repeat(SHA256_HEX_CHARACTERS);

interface LegacyBaselineRecord {
	readonly schemaVersion:
		| typeof LEGACY_BASELINE_CORPUS_FIXTURE_VERSION
		| typeof LEGACY_CONTROL_CORPUS_FIXTURE_VERSION;
	readonly kind: "derived";
	readonly skillUnderTest: string;
	readonly arms: Readonly<Record<"baseline" | "candidate" | "control", string>>;
	readonly controlCorpus?: string;
	readonly baselineCorpus?: string;
}

async function reportDirectoryHolding(
	record: LegacyBaselineRecord,
): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "baseline-record-"));
	resources.track(directory);
	await Bun.write(
		comparisonBaselineRecordFile(directory),
		JSON.stringify(record),
	);

	return directory;
}

describe(readComparisonBaselineRecord.name, () => {
	it.each([
		{
			corpus: { controlCorpus: CORPUS },
			schemaVersion: LEGACY_CONTROL_CORPUS_FIXTURE_VERSION,
		},
		{
			corpus: { baselineCorpus: CORPUS },
			schemaVersion: LEGACY_BASELINE_CORPUS_FIXTURE_VERSION,
		},
	])(
		"reads a version $schemaVersion record's arms as one group each, in their own roles",
		async ({ schemaVersion, corpus }) => {
			const directory = await reportDirectoryHolding({
				arms: { baseline: "arm-a", candidate: "arm-b", control: "derived" },
				kind: "derived" as const,
				schemaVersion,
				skillUnderTest: "build",
				...corpus,
			});

			const recorded = await readComparisonBaselineRecord(directory);

			expect(recorded).toEqual({
				kind: "recorded",
				record: {
					arms: {
						baseline: ["arm-a"],
						candidate: ["arm-b"],
						control: ["derived"],
					},
					controlCorpus: CORPUS,
					kind: "derived",
					schemaVersion: 3,
					skillUnderTest: "build",
				},
			});
		},
	);
});

describe(writeComparisonBaselineRecord.name, () => {
	it("retains the historical baseline record bytes", async () => {
		const directory = await mkdtemp(join(tmpdir(), "baseline-record-"));
		resources.track(directory);
		const extension = "d".repeat(SHA256_HEX_CHARACTER_COUNT);

		await writeComparisonBaselineRecord(directory, {
			arms: {
				baseline: ["before"],
				candidate: ["after"],
				control: ["control"],
			},
			controlCorpus: CORPUS,
			extends: extension,
			kind: "derived",
			schemaVersion: 3,
			skillUnderTest: "build",
		});
		const text = await Bun.file(comparisonBaselineRecordFile(directory)).text();

		expect(text).toBe(`{
  "schemaVersion": 3,
  "kind": "derived",
  "skillUnderTest": "build",
  "arms": {
    "baseline": [
      "before"
    ],
    "candidate": [
      "after"
    ],
    "control": [
      "control"
    ]
  },
  "controlCorpus": "${CORPUS}",
  "extends": "${extension}"
}
`);
	});
});
