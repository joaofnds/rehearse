import { describe, expect, it } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	comparisonBaselineRecordFile,
	readComparisonBaselineRecord,
} from "./comparison-baseline-record";

const CORPUS = "c".repeat(64);

async function reportDirectoryHolding(record: object): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "baseline-record-"));
	await Bun.write(
		comparisonBaselineRecordFile(directory),
		JSON.stringify(record),
	);

	return directory;
}

describe(readComparisonBaselineRecord.name, () => {
	it.each([
		{ schemaVersion: 2, corpus: { controlCorpus: CORPUS } },
		{ schemaVersion: 1, corpus: { baselineCorpus: CORPUS } },
	])(
		"reads a version $schemaVersion record's arms as one group each, in their own roles",
		async ({ schemaVersion, corpus }) => {
			const directory = await reportDirectoryHolding({
				schemaVersion,
				kind: "derived",
				skillUnderTest: "build",
				arms: { baseline: "arm-a", candidate: "arm-b", control: "derived" },
				...corpus,
			});

			const recorded = await readComparisonBaselineRecord(directory);

			expect(recorded).toEqual({
				kind: "recorded",
				record: {
					schemaVersion: 3,
					kind: "derived",
					skillUnderTest: "build",
					arms: {
						baseline: ["arm-a"],
						candidate: ["arm-b"],
						control: ["derived"],
					},
					controlCorpus: CORPUS,
				},
			});
		},
	);
});
