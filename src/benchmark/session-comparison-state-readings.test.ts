import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import writeComparisonReport from "./comparison-command";
import { writeManifest } from "./session-comparison-group-test-fixture";
import { readSingleCaseSessionReport } from "./session-comparison-report-reader-fixture";
import { readDeclaredStateCheck } from "./session-comparison-state-test-fixture";
import { comparisonSuiteRoot } from "./session-comparison-workspace-fixture";

const FIRST_REPORTED_CASE_INDEX = 0;

const root = comparisonSuiteRoot();

async function testCarriesPerStateTalliesForArmsWhoseStateGradesDiffer(): Promise<void> {
	const expectedCaseCount = 1;
	const stateCheck = await readDeclaredStateCheck();
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest(
		{ root, runsDirectory },
		{ caseIds: ["case-one"], selectVariant: undefined, stateCheck },
	);

	const reportFile = await writeComparisonReport({
		manifestPath,
		runsDirectory,
	});
	const report = await readSingleCaseSessionReport(reportFile);
	const reps =
		report.cases[FIRST_REPORTED_CASE_INDEX]?.arms.candidate.source.reps ?? [];

	expect(report.cases).toHaveLength(expectedCaseCount);
	expect(reps.map((rep) => rep.stateResults)).toEqual([
		{ declared: 3, failing: [], passed: 3 },
		{ declared: 3, failing: [], passed: 3 },
	]);
	expect(
		report.cases[FIRST_REPORTED_CASE_INDEX]?.arms.control.source.reps.map(
			(rep) => rep.stateResults,
		),
	).toEqual([
		{
			declared: 3,
			failing: stateCheck.outcomes.map((name) => ({
				detail: `${name} does not hold`,
				name,
			})),
			passed: 0,
		},
		{
			declared: 3,
			failing: stateCheck.outcomes.map((name) => ({
				detail: `${name} does not hold`,
				name,
			})),
			passed: 0,
		},
	]);
}

describe("session comparison state readings", () => {
	it(
		"carries per-state tallies for arms whose state grades differ",
		testCarriesPerStateTalliesForArmsWhoseStateGradesDiffer,
	);
});
