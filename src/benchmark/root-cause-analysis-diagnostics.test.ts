import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";

import { analyzeRun, readRootCauseAnalyses } from "./root-cause-analysis";
import {
	FakeAnalysisProvider,
	answering,
} from "./root-cause-analysis-provider-test-fixtures";
import {
	FIRST_UNREADABLE_ANALYSIS_INDEX,
	dependencies,
	registerAnalysisFixtureCleanup,
	runsDirectory,
	writeAnalysisFile,
} from "./root-cause-analysis-test-environment";
import type {
	AnalysisDiagnosticExample,
	AnalysisStorageExample,
} from "./root-cause-analysis-test-environment";
import { RUN, runStoppedAtBuild } from "./root-cause-analysis-test-support";

registerAnalysisFixtureCleanup();

const ANALYSIS_EXAMPLES_1 = [
	{
		json: "{}",
		name: "missing answer fields",
		reason:
			"✖ Invalid input: expected object, received undefined\n  → at rootCause\n✖ Invalid input: expected string, received undefined\n  → at narrative\n✖ Invalid input: expected string, received undefined\n  → at pairedRerun\n✖ Invalid input: expected array, received undefined\n  → at stages",
	},
	{
		json: '{"rootCause":{"stage":1,"file":1,"lines":{"start":0,"end":0}},"narrative":1,"pairedRerun":1,"stages":[{"stage":1,"role":1,"note":1,"contribution":1}]}',
		name: "nested answer fields",
		reason:
			'✖ Invalid input: expected string, received number\n  → at narrative\n✖ Invalid input: expected string, received number\n  → at pairedRerun\n✖ Invalid input: expected string, received number\n  → at rootCause.stage\n✖ Invalid input: expected string, received number\n  → at rootCause.file\n✖ Too small: expected number to be >0\n  → at rootCause.lines.start\n✖ Too small: expected number to be >0\n  → at rootCause.lines.end\n✖ Invalid input: expected string, received number\n  → at stages[0].stage\n✖ Invalid option: expected one of "not a factor"|"contributing factor"|"root cause"\n  → at stages[0].role\n✖ Invalid input: expected string, received number\n  → at stages[0].note\n✖ Invalid input: expected string, received number\n  → at stages[0].contribution',
	},
];
const ANALYSIS_EXAMPLES_22 = [
	{
		digest: "0da324b58a2a6b1d20c50c13e3c8de2318538a7ad2954d740b00393ba1d9a3e0",
		json: '{"schemaVersion":2,"outcome":"failed"}',
		name: "current failed record base",
	},
	{
		digest: "0da324b58a2a6b1d20c50c13e3c8de2318538a7ad2954d740b00393ba1d9a3e0",
		json: '{"schemaVersion":1,"outcome":"failed"}',
		name: "legacy failed record base",
	},
	{
		digest: "56b1bf02a8e3b582f57f98d986dd4603a13e4de69536c7b8833e9c40f2d5fb74",
		json: '{"schemaVersion":2,"outcome":"recorded"}',
		name: "current recorded answer before base",
	},
	{
		digest: "09b88095539d2647539d53126addac526eef09fc33d3946008875bca5256deeb",
		json: '{"schemaVersion":1,"outcome":"recorded"}',
		name: "legacy recorded base before answer",
	},
	{
		digest: "90b8ac4831cfe77de845adf65c5d1b6509c8a2fa0934cdd15abbb33f1243bc63",
		json: '{"schemaVersion":2,"run":"2026-10-04T10-00-00.000Z","model":"sonnet","capUsd":1,"startedAt":"2026-10-04T12:00:00.000Z","durationMs":4000,"bundleDigest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","bundleBytes":0,"rootCause":{"stage":1,"file":1,"lines":{"start":0,"end":0}},"narrative":1,"pairedRerun":1,"stages":[{"stage":1,"role":1,"note":1,"contribution":1}],"outcome":"recorded"}',
		name: "current nested recorded answer and union branches",
	},
	{
		digest: "f6eaa53e978dc264892bb40d6a35f4a7449d106f520b73a3518428ffd8bef753",
		json: '{"schemaVersion":1,"run":"2026-10-04T10-00-00.000Z","model":"sonnet","capUsd":1,"startedAt":"2026-10-04T12:00:00.000Z","durationMs":4000,"bundleDigest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","bundleBytes":0,"outcome":"recorded","culprit":{"stage":1,"file":1,"lines":{"start":0,"end":0}},"narrative":1,"pairedRerun":1,"stages":[{"stage":1,"role":1,"note":1,"contribution":1}]}',
		name: "legacy nested culprit and union branches",
	},
];
async function recordsHistoricalAnalysisDiagnostic({
	json,
	reason,
}: AnalysisDiagnosticExample): Promise<void> {
	const directory = await runsDirectory();
	await runStoppedAtBuild(directory);
	const provider = new FakeAnalysisProvider();
	provider.answer(answering(JSON.parse(json)));

	const { record } = await analyzeRun(
		{ capUsd: 1, model: "sonnet", run: RUN, runsDirectory: directory },
		dependencies(provider.invoke),
	);

	expect(record).toMatchObject({ outcome: "failed", reason });
}

async function retainsStoredAnalysisDiagnostic({
	digest,
	json,
}: AnalysisStorageExample): Promise<void> {
	const directory = await runsDirectory();
	await writeAnalysisFile(directory, json);

	const reading = await readRootCauseAnalyses({
		run: RUN,
		runsDirectory: directory,
	});
	const reason =
		reading.unreadable[FIRST_UNREADABLE_ANALYSIS_INDEX]?.reason ?? "";
	const actual = createHash("sha256").update(reason).digest("hex");

	expect(reading.records).toEqual([]);
	expect(reading.unreadable.map(({ file }) => file)).toEqual([
		"2026-10-04T13-12-13.567Z.json",
	]);
	expect(actual).toBe(digest);
}
describe(analyzeRun.name, () => {
	it.each(ANALYSIS_EXAMPLES_1)(
		"retains the historical failed-answer diagnostic for $name",
		recordsHistoricalAnalysisDiagnostic,
	);
});
describe(readRootCauseAnalyses.name, () => {
	it.each(ANALYSIS_EXAMPLES_22)(
		"retains historical stored diagnostics for $name",
		retainsStoredAnalysisDiagnostic,
	);
});
