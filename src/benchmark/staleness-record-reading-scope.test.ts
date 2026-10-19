import { describe, expect, it } from "bun:test";

import { directorySource } from "./run-records-test-support";
import CountedStalenessEvidence from "./staleness-counted-evidence-test-fixtures";
import CountingCorpusReader from "./staleness-counting-reader-test-fixtures";
import { checkpointReport, everyRecordStaleness } from "./staleness-report";
import { TestResources } from "./test-support";

const resources = TestResources.forEachTest();

async function hashesTheCorpusUnderTestOnceAndJudgesEachRecordOnce(): Promise<void> {
	const evidence = new CountedStalenessEvidence(resources);
	const { fixture, corpus } = await evidence.capture();
	const reader = new CountingCorpusReader();

	const every = await everyRecordStaleness(
		fixture.runsDirectory,
		directorySource(corpus),
		reader.read,
	);

	const measured = [
		checkpointReport(every.checkpoints),
		every.sessionAttempts,
		every.replayAttempts,
		every.groups,
	]
		.flatMap(({ records }) => records)
		.filter(({ id }) => !id.endsWith("/initial"));
	expect(every.replayAttempts.records).not.toEqual([]);
	expect({ hashes: reader.hashes, judgments: reader.judgments }).toEqual({
		hashes: 1,
		judgments: measured.length,
	});
}

describe(everyRecordStaleness.name, () => {
	it(
		"hashes the corpus under test once and judges each record once",
		hashesTheCorpusUnderTestOnceAndJudgesEachRecordOnce,
	);
});
