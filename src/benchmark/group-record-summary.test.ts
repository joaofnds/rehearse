import { describe, expect, it } from "bun:test";

import { confirmationGroupRecordSchema } from "./confirmation-record";
import type { RepReadsSummary } from "./record-summary";
import { groupSummary, parseGroupReportSummaryRecord } from "./record-summary";
import {
	GROUP_RECORD,
	GROUP_REPORT,
	NO_READS,
	SESSION_GROUP_RECORD,
} from "./record-summary-group-test-fixtures";

const DIGEST_SUFFIX_CHARACTER_COUNT = 58;

const SHA256_HEX_DIGITS = 64;

function rendersTheReliabilitySummaryAndTheGroupSCost(): void {
	expect(groupSummary(GROUP_RECORD, GROUP_REPORT, NO_READS)).toBe(
		`## group:group-1

Case audit-log, stage mode, 2 reps.
Corpus version not recorded.

| outcome | successful | success rate | standard error | pass^k |
| --- | --- | --- | --- | --- |
| build | 1/2 | 0.500 | 0.354 | 0.250 |

Cost $4.00 over 2 reps.

No rep recorded a read.
`,
	);
}

function listsEachRepStageSReadsWithItsHashAndWhetherItChangedSince(): void {
	const summary: RepReadsSummary = {
		judgedAgainst: "the live install",
		reads: {
			reasons: [],
			reps: [
				{
					readManifest: [
						{
							evidence: "declared and observed",
							half: "corpus",
							path: "skills/build/SKILL.md",
							role: "stage skill",
							sha256: "b".repeat(SHA256_HEX_DIGITS),
							state: "changed",
						},
						{
							evidence: "observed",
							half: "project",
							path: "CLAUDE.md",
							role: "project instructions",
							sha256: "c".repeat(SHA256_HEX_DIGITS),
						},
					],
					repId: "group-1-rep-1",
					stage: "build",
				},
			],
		},
	};

	expect(groupSummary(GROUP_RECORD, GROUP_REPORT, summary)).toContain(
		`| rep | stage | path | role | evidence | sha256 | state |
| --- | --- | --- | --- | --- | --- | --- |
| group-1-rep-1 | build | skills/build/SKILL.md | stage skill | declared and observed | bbbbbbbbbbbb | changed |
| group-1-rep-1 | build | CLAUDE.md | project instructions | observed | cccccccccccc | not judged |
States compare each file with the live install as it was when this summary was printed.
`,
	);
}

function listsASessionRepSReadsWithNoStageColumn(): void {
	const summary: RepReadsSummary = {
		judgedAgainst: "the live install",
		reads: {
			reasons: [],
			reps: [
				{
					readManifest: [
						{
							evidence: "declared",
							half: "corpus",
							path: "output-styles/brief.md",
							role: "global instructions",
							sha256: "d".repeat(SHA256_HEX_DIGITS),
							state: "unchanged",
						},
					],
					repId: "session-rep-1",
				},
			],
		},
	};

	expect(groupSummary(SESSION_GROUP_RECORD, GROUP_REPORT, summary)).toContain(
		`| rep | path | role | evidence | sha256 | state |
| --- | --- | --- | --- | --- | --- |
| session-rep-1 | output-styles/brief.md | global instructions | declared | dddddddddddd | unchanged |
`,
	);
}

function keepsTheReadsItCouldNotJudgeAndNamesWhyOneLineEach(): void {
	const summary: RepReadsSummary = {
		judgedAgainst: undefined,
		reads: {
			reasons: [
				'group-1-rep-2 build could not be read: [\n  {\n    "code": "invalid_value"',
				"Reads not judged: the group froze no pipeline to hash its stages against",
			],
			reps: [
				{
					readManifest: [
						{
							evidence: "observed",
							half: "corpus",
							path: "skills/a|b/SKILL.md",
							role: "read for context",
							sha256: "e".repeat(SHA256_HEX_DIGITS),
						},
					],
					repId: "group-1-rep-1",
					stage: "build",
				},
			],
		},
	};

	expect(groupSummary(GROUP_RECORD, GROUP_REPORT, summary)).toContain(
		`| group-1-rep-1 | build | skills/a\\|b/SKILL.md | read for context | observed | eeeeeeeeeeee | not judged |
group-1-rep-2 build could not be read: [ { "code": "invalid_value".
Reads not judged: the group froze no pipeline to hash its stages against.
`,
	);
}

function namesTheCorpusVersionTheGroupRanAgainst(): void {
	const record = confirmationGroupRecordSchema.parse({
		...GROUP_RECORD,
		inputs: {
			...GROUP_RECORD.inputs,
			corpusVersion: {
				digest: `4e196b${"0".repeat(DIGEST_SUFFIX_CHARACTER_COUNT)}`,
				kind: "version",
			},
		},
	});

	expect(groupSummary(record, GROUP_REPORT, NO_READS)).toContain(
		"\nCorpus corpus@4e196b.\n",
	);
}

function namesTheRefusalThatKeptTheGroupSCorpusFromBeingAVersion(): void {
	const record = confirmationGroupRecordSchema.parse({
		...GROUP_RECORD,
		inputs: {
			...GROUP_RECORD.inputs,
			corpusVersion: {
				kind: "refused",
				refusal: "a symlink escapes the root",
			},
		},
	});

	expect(groupSummary(record, GROUP_REPORT, NO_READS)).toContain(
		"\nCorpus refused: a symlink escapes the root.\n",
	);
}

function doesNotPresentARepOnlyNumberAsCommandCostWhenPreflightMetricsAreMissing(): void {
	const expectedSmallerCommandCostUsd = 1.25;
	const expectedLargerCommandCostUsd = 2.75;

	const report = parseGroupReportSummaryRecord(
		JSON.stringify({
			...GROUP_REPORT,
			resources: {
				commandTotal: {
					missing: ["preflight call metrics"],
					status: "MISSING",
				},
				total: {
					costUsd: [
						expectedSmallerCommandCostUsd,
						expectedLargerCommandCostUsd,
					],
				},
			},
		}),
	);

	expect(groupSummary(GROUP_RECORD, report, NO_READS)).toContain(
		"Cost unavailable: preflight call metrics.",
	);
	expect(groupSummary(GROUP_RECORD, report, NO_READS)).not.toContain(
		"Cost $4.00",
	);
}

function doesNotFallBackToRepOnlyCostWhenAV2SessionReportOmitsItsCommandTotal(): void {
	expect(groupSummary(SESSION_GROUP_RECORD, GROUP_REPORT, NO_READS)).toContain(
		"Cost unavailable: command total evidence is missing.",
	);
}

describe(groupSummary.name, () => {
	it(
		"renders the reliability summary and the group's cost",
		rendersTheReliabilitySummaryAndTheGroupSCost,
	);
	it(
		"lists each rep stage's reads with its hash and whether it changed since",
		listsEachRepStageSReadsWithItsHashAndWhetherItChangedSince,
	);
	it(
		"lists a session rep's reads with no stage column",
		listsASessionRepSReadsWithNoStageColumn,
	);
	it(
		"keeps the reads it could not judge and names why, one line each",
		keepsTheReadsItCouldNotJudgeAndNamesWhyOneLineEach,
	);
	it(
		"names the corpus version the group ran against",
		namesTheCorpusVersionTheGroupRanAgainst,
	);
	it(
		"names the refusal that kept the group's corpus from being a version",
		namesTheRefusalThatKeptTheGroupSCorpusFromBeingAVersion,
	);
	it(
		"does not present a rep-only number as command cost when preflight metrics are missing",
		doesNotPresentARepOnlyNumberAsCommandCostWhenPreflightMetricsAreMissing,
	);
	it(
		"does not fall back to rep-only cost when a v2 session report omits its command total",
		doesNotFallBackToRepOnlyCostWhenAV2SessionReportOmitsItsCommandTotal,
	);
});
