import { describe, expect, it } from "bun:test";

import { runShow } from "#cli/show-command";

import writeComparisonReport from "./comparison-command";
import { digest } from "./session-comparison-record-test-fixture";
import { readSingleCaseSessionReport } from "./session-comparison-report-reader-fixture";
import StateComparisonFixture from "./session-comparison-state-test-fixture";
import { comparisonSuiteRoot } from "./session-comparison-workspace-fixture";

const FIRST_REPORTED_CASE_INDEX = 0;

const root = comparisonSuiteRoot("rehearse-state-comparison-");

const projectsDirectory = comparisonSuiteRoot("rehearse-state-projects-");

async function observesEachArmsCorpus(): Promise<void> {
	const fixture = new StateComparisonFixture({ projectsDirectory, root });
	const { groups } = await fixture.writeManifest();

	expect(
		[groups.baseline, groups.candidate, groups.control].map((group) =>
			group.seenStyles.toSorted(),
		),
	).toEqual([
		["baseline:baseline corpus\n", "baseline:baseline corpus\n"],
		["candidate:candidate corpus\n", "candidate:candidate corpus\n"],
		["control:undefined", "control:undefined"],
	]);
}

async function gradesTheTreeEachSessionLeaves(): Promise<void> {
	const expectedCaseCount = 1;
	const fixture = new StateComparisonFixture({ projectsDirectory, root });
	const { manifestPath, runsDirectory } = await fixture.writeManifest();

	const reportFile = await writeComparisonReport({
		manifestPath,
		runsDirectory,
	});
	const report = await readSingleCaseSessionReport(reportFile);

	const idleStateResults = {
		declared: 3,
		failing: [
			{
				detail: "LEDGER.md carries the February refund",
				name: "ledger-amended",
			},
			{
				detail: "the top commit posts the February refund",
				name: "work-committed",
			},
		],
		passed: 1,
	};

	expect(report.cases).toHaveLength(expectedCaseCount);
	expect(
		report.cases[FIRST_REPORTED_CASE_INDEX]?.arms.candidate.source.reps.map(
			(rep) => rep.stateResults,
		),
	).toEqual([
		{ declared: 3, failing: [], passed: 3 },
		{ declared: 3, failing: [], passed: 3 },
	]);
	expect(
		report.cases[FIRST_REPORTED_CASE_INDEX]?.arms.control.source.reps.map(
			(rep) => rep.stateResults,
		),
	).toEqual([idleStateResults, idleStateResults]);
	expect(
		report.cases[FIRST_REPORTED_CASE_INDEX]?.arms.control.source.reps.map(
			(rep) => rep.checks,
		),
	).toEqual([
		{ declared: 1, failing: [], passed: 1 },
		{ declared: 1, failing: [], passed: 1 },
	]);
}

async function showsTheSingleCaseStateSummary(): Promise<void> {
	const fixture = new StateComparisonFixture({ projectsDirectory, root });
	const { manifestPath, runsDirectory } = await fixture.writeManifest();

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

	const summary = shown.join("");

	expect(summary).toContain("1 case, session mode, 2 reps.");
	expect(summary).toContain("this estimate covers case state-probe only");
}

async function showsEachArmsQualityRates(): Promise<void> {
	const fixture = new StateComparisonFixture({ projectsDirectory, root });
	const { manifestPath, runsDirectory } = await fixture.writeManifest();

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

	const summary = shown.join("");

	expect(summary).toContain("| candidate | 2/2 | 1.000 | 0.342-1.000 |");
	expect(summary).toContain("| control | 2/2 | 1.000 | 0.342-1.000 |");
}

describe("session comparison state scoring", () => {
	describe("a committed state-scored case compared across three arms", () => {
		it(
			"observes each arm's declared corpus during its session",
			observesEachArmsCorpus,
		);

		it(
			"grades every arm with the case's own scorer over the tree its session left",
			gradesTheTreeEachSessionLeaves,
		);

		it("shows the single-case state summary", showsTheSingleCaseStateSummary);

		it("shows each arm's quality rates", showsEachArmsQualityRates);
	});
});
