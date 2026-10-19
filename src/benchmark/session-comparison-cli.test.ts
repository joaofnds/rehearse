import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { runList } from "#cli/list-command";
import { runShow } from "#cli/show-command";

import writeComparisonReport from "./comparison-command";
import { parseComparisonReport } from "./comparison-record";
import { writeManifest } from "./session-comparison-group-test-fixture";
import { digest } from "./session-comparison-record-test-fixture";
import { comparisonSuiteRoot } from "./session-comparison-workspace-fixture";

const root = comparisonSuiteRoot();

async function testListsAnExistingMultiCaseSessionComparison(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });

	await writeComparisonReport({
		manifestPath,
		runsDirectory,
	});

	const digestValue = digest(await Bun.file(manifestPath).text());
	const listed: string[] = [];

	await runList(
		{ kind: "comparisons", runsDirectory },
		{
			stderr: (message) => {
				expect.unreachable(message);
			},
			stdout: (text) => {
				listed.push(text);
			},
		},
	);

	expect(listed.join("")).toContain(`comparison:${digestValue}`);
	expect(listed.join("")).toContain("\t2 cases\t2 reps");
}

async function testShowsTheMultiCaseSessionSummary(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });

	await writeComparisonReport({
		manifestPath,
		runsDirectory,
	});

	const digestValue = digest(await Bun.file(manifestPath).text());
	const shown: string[] = [];

	await runShow(
		{
			id: `comparison:${digestValue}`,
			json: false,
			runsDirectory,
		},
		{
			stderr: (message) => {
				expect.unreachable(message);
			},
			stdout: (text) => {
				shown.push(text);
			},
		},
	);

	expect(shown.join("")).toContain("2 cases, session mode, 2 reps.");
}

async function testShowsTheMultiCaseSessionJSON(): Promise<void> {
	const expectedSchemaVersion = 6;
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });

	await writeComparisonReport({
		manifestPath,
		runsDirectory,
	});

	const digestValue = digest(await Bun.file(manifestPath).text());
	const shownJson: string[] = [];

	await runShow(
		{
			id: `comparison:${digestValue}`,
			json: true,
			runsDirectory,
		},
		{
			stderr: (message) => {
				expect.unreachable(message);
			},
			stdout: (text) => {
				shownJson.push(text);
			},
		},
	);

	expect(parseComparisonReport(shownJson.join("")).schemaVersion).toBe(
		expectedSchemaVersion,
	);
}

async function testEstimatesTheCostStandardErrorWhenAnArmSRepsDifferInSpend(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest(
		{ root, runsDirectory },
		{ caseIds: ["case-four"], selectVariant: undefined },
	);

	await writeComparisonReport({ manifestPath, runsDirectory });

	const digestValue = digest(await Bun.file(manifestPath).text());
	const shown: string[] = [];

	await runShow(
		{ id: `comparison:${digestValue}`, json: false, runsDirectory },
		{
			stderr: (message) => {
				expect.unreachable(message);
			},
			stdout: (text) => {
				shown.push(text);
			},
		},
	);

	expect(shown.join("")).toContain("| candidate − baseline | +0.000 | 0.014 |");
}

describe("session comparison cli", () => {
	it(
		"lists an existing multi-case session comparison",
		testListsAnExistingMultiCaseSessionComparison,
	);

	it(
		"shows the multi-case session summary",
		testShowsTheMultiCaseSessionSummary,
	);

	it("shows the multi-case session JSON", testShowsTheMultiCaseSessionJSON);

	it(
		"estimates the cost standard error when an arm's reps differ in spend",
		testEstimatesTheCostStandardErrorWhenAnArmSRepsDifferInSpend,
	);

	it(
		"shows the single-case rep-sampling summary",
		testShowsTheSingleCaseRepSamplingSummary,
	);

	it(
		"lists the single-case session comparison",
		testListsTheSingleCaseSessionComparison,
	);
});

async function testShowsTheSingleCaseRepSamplingSummary(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest(
		{ root, runsDirectory },
		{ caseIds: ["case-one"], selectVariant: undefined },
	);

	await writeComparisonReport({
		manifestPath,
		runsDirectory,
	});

	const digestValue = digest(await Bun.file(manifestPath).text());
	const shown: string[] = [];

	await runShow(
		{ id: `comparison:${digestValue}`, json: false, runsDirectory },
		{
			stderr: (message) => {
				expect.unreachable(message);
			},
			stdout: (text) => {
				shown.push(text);
			},
		},
	);

	const summary = withoutMeasuredElapsed(shown.join(""));

	expect(summary).toBe(expectedSingleCaseSummary(digestValue));
}

async function testListsTheSingleCaseSessionComparison(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest(
		{ root, runsDirectory },
		{ caseIds: ["case-one"], selectVariant: undefined },
	);

	await writeComparisonReport({
		manifestPath,
		runsDirectory,
	});

	const listed: string[] = [];

	await runList(
		{ kind: "comparisons", runsDirectory },
		{
			stderr: (message) => {
				expect.unreachable(message);
			},
			stdout: (text) => {
				listed.push(text);
			},
		},
	);

	expect(listed.join("")).toContain("\t1 case\t2 reps");
}

function expectedSingleCaseSummary(digestValue: string): string {
	return `## comparison:${digestValue}

1 case, session mode, 2 reps.

Sampling unit: rep. Arms are independent samples; this estimate covers case case-one only.

| arm | successful | success rate | 95% interval | pass^k |
| --- | --- | --- | --- | --- |
| baseline | 1/2 | 0.500 | 0.095-0.905 | 0.250 |
| candidate | 2/2 | 1.000 | 0.342-1.000 | 1.000 |
| control | 0/2 | 0.000 | 0.000-0.658 | 0.000 |

| contrast | outcome | success rate Δ | standard error | pass^k Δ |
| --- | --- | --- | --- | --- |
| candidate − baseline | checks | +0.500 | 0.354 | +0.750 |
| candidate − control | checks | +1.000 | 0.000 | +1.000 |
| baseline − control | checks | +0.500 | 0.354 | +0.250 |

| contrast | cost Δ | standard error | per-attempt elapsed Δ (ms) | standard error |
| --- | --- | --- | --- | --- |
| candidate − baseline | +0.000 | no observed spread | <measured> | <measured> |
| candidate − control | +0.000 | no observed spread | <measured> | <measured> |
| baseline − control | +0.000 | no observed spread | <measured> | <measured> |
`;
}

function withoutMeasuredElapsed(summary: string): string {
	return summary.replaceAll(
		/(?<costSpread>no observed spread \| )[^|]+\| [^|]+\|/gu,
		"$<costSpread><measured> | <measured> |",
	);
}
