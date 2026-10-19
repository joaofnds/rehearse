import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import writeComparisonReport from "./comparison-command";
import { writeManifest } from "./session-comparison-group-test-fixture";
import {
	readSessionComparisonReport,
	readSingleCaseSessionReport,
} from "./session-comparison-report-reader-fixture";
import { FIRST_REP_ORDINAL } from "./session-comparison-test-contract";
import { comparisonSuiteRoot } from "./session-comparison-workspace-fixture";

const FIRST_REPORTED_CASE_INDEX = 0;

const root = comparisonSuiteRoot();

async function testDistinguishesPartialScoresAndNamesEachFailingCheck(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest(
		{ root, runsDirectory },
		{ caseIds: ["case-three"], selectVariant: undefined },
	);

	const reportFile = await writeComparisonReport({
		manifestPath,
		runsDirectory,
	});
	const report = await readSingleCaseSessionReport(reportFile);
	const reps =
		report.cases[FIRST_REPORTED_CASE_INDEX]?.arms.baseline.source.reps ?? [];

	expect(
		report.cases[FIRST_REPORTED_CASE_INDEX]?.arms.control.source.reps.map(
			(rep) => rep.checks,
		),
	).toEqual([
		{
			declared: 2,
			failing: [{ detail: "3 words", index: 0, kind: "word-band" }],
			passed: 1,
		},
		{
			declared: 2,
			failing: [
				{ detail: "3 words", index: 0, kind: "word-band" },
				{ detail: "3 tool calls", index: 1, kind: "tool-calls" },
			],
			passed: 0,
		},
	]);
	expect(reps.map((rep) => rep.checks)).toEqual([
		{ declared: 2, failing: [], passed: 2 },
		{
			declared: 2,
			failing: [
				{ detail: "3 words", index: 0, kind: "word-band" },
				{ detail: "3 tool calls", index: 1, kind: "tool-calls" },
			],
			passed: 0,
		},
	]);
}

async function testRecordsEachRepSReplyWordCountAndWhyARepWithNoReplyHasNone(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest(
		{ root, runsDirectory },
		{
			selectVariant: (caseId, role, ordinal) =>
				caseId === "case-one" &&
				role === "candidate" &&
				ordinal === FIRST_REP_ORDINAL
					? "no-reply"
					: undefined,
		},
	);

	const reportFile = await writeComparisonReport({
		manifestPath,
		runsDirectory,
	});
	const report = await readSessionComparisonReport(reportFile);
	const arms = report.cases[FIRST_REPORTED_CASE_INDEX]?.arms;

	expect(arms?.candidate.source.reps.map((rep) => rep.words)).toEqual([
		{ reason: "the attempt recorded no reply", state: "unavailable" },
		{ state: "available", words: 1 },
	]);
	expect(arms?.control.source.reps.map((rep) => rep.words)).toEqual([
		{ state: "available", words: 3 },
		{ state: "available", words: 3 },
	]);
}

describe("session comparison checks", () => {
	it(
		"distinguishes partial scores and names each failing check",
		testDistinguishesPartialScoresAndNamesEachFailingCheck,
	);
	it(
		"records each rep's reply word count, and why a rep with no reply has none",
		testRecordsEachRepSReplyWordCountAndWhyARepWithNoReplyHasNone,
	);
});
