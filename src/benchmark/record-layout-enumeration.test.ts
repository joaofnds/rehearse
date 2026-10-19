import { describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import RecordLayoutFixtures from "./record-layout-test-fixtures";
import { comparisonDigests, replayAttemptIds } from "./run-layout";

const SHA256_HEX_DIGITS = 64;

const fixtures = RecordLayoutFixtures.forEachTest();

async function namesEveryComparisonReportDirectory(): Promise<void> {
	const root = await fixtures.root();
	await mkdir(join(root, "comparisons", "b".repeat(SHA256_HEX_DIGITS)), {
		recursive: true,
	});
	await mkdir(join(root, "comparisons", "a".repeat(SHA256_HEX_DIGITS)), {
		recursive: true,
	});

	expect(await comparisonDigests(root)).toEqual([
		"a".repeat(SHA256_HEX_DIGITS),
		"b".repeat(SHA256_HEX_DIGITS),
	]);
}

async function namesEveryStageReplayByItsLineageAndItsTimestamp(): Promise<void> {
	const root = await fixtures.root();
	await mkdir(join(root, "replays", "lineage-1"), { recursive: true });
	await Bun.write(
		join(root, "replays", "lineage-1", "2026-09-03T00-00-00.000Z.json"),
		"{}\n",
	);
	await Bun.write(join(root, "replays", "lineage-1", "notes.txt"), "x\n");

	expect(await replayAttemptIds(root)).toEqual([
		{ lineage: "lineage-1", timestamp: "2026-09-03T00-00-00.000Z" },
	]);
}

describe("recorded record enumeration", () => {
	it(
		"names every comparison report directory",
		namesEveryComparisonReportDirectory,
	);

	it(
		"names every stage replay by its lineage and its timestamp",
		namesEveryStageReplayByItsLineageAndItsTimestamp,
	);
});
