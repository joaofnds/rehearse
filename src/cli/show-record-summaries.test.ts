import { describe, expect, it } from "bun:test";

import { RefusedPreconditionError } from "#benchmark/exit-codes";
import {
	benchmarkRunPaths,
	confirmationGroupPaths,
} from "#benchmark/run-layout";
import {
	CliTestWorkspace,
	failureOf,
	recordOutput,
} from "#cli/cli-test-support";
import { runShow } from "#cli/show-command";

import { NO_CORPUS } from "./show-record-test-driver";

const workspace = CliTestWorkspace.forEachTest();

async function printsTheRecordThatExistsOnDiskForA(): Promise<void> {
	const fixture = await workspace.writtenRecords();
	await fixture.stopped.writeStoppedRun();
	const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.stoppedRun);

	const recorder = recordOutput();

	await runShow(
		{
			id: `run:${fixture.stoppedRun}`,
			json: true,
			runsDirectory: fixture.runsDirectory,
		},
		recorder.output,
		NO_CORPUS,
	);

	const stdout = recorder.stdout.join("");

	expect(stdout).toBe(await Bun.file(paths.stageFile("build")).text());
}

async function printsAStoppedRunSStageRecordRatherThan(): Promise<void> {
	const fixture = await workspace.writtenRecords();
	await fixture.stopped.writeStoppedRun();
	const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.stoppedRun);

	const recorder = recordOutput();

	await runShow(
		{
			id: `run:${fixture.stoppedRun}`,
			json: false,
			runsDirectory: fixture.runsDirectory,
		},
		recorder.output,
		NO_CORPUS,
	);

	const stdout = recorder.stdout.join("");

	expect(stdout).toBe(await Bun.file(paths.stageFile("build")).text());
}

async function refusesARunWithNoRecordOfAnyKind(): Promise<void> {
	const fixture = await workspace.writtenRecords();
	await fixture.events.writeNoRecordRun();

	const failure = await failureOf(
		runShow(
			{
				id: `run:${fixture.noRecordRun}`,
				json: true,
				runsDirectory: fixture.runsDirectory,
			},
			recordOutput().output,
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toContain(fixture.noRecordRun);
}

async function printsARunSStagesGradesVerdictAndTotal(): Promise<void> {
	const fixture = await workspace.writtenRecords();

	const recorder = recordOutput();

	await runShow(
		{
			id: `run:${fixture.replayableRun}`,
			json: false,
			runsDirectory: fixture.runsDirectory,
		},
		recorder.output,
		NO_CORPUS,
	);

	const stdout = recorder.stdout.join("");

	expect(stdout).toContain("| stage | grade | verdict | cost |");
	expect(stdout).toContain("| build | B | CONTINUE | $2.00 |");
	expect(stdout).toContain("Final verdict PASS.");
	expect(stdout).toContain("Total cost $7.75.");
	expect(() => {
		JSON.parse(stdout);
	}).toThrow();
}

async function printsAComparisonSPairedDeltasBesideTheControl(): Promise<void> {
	const fixture = await workspace.writtenRecords();

	const recorder = recordOutput();

	await runShow(
		{
			id: `comparison:${fixture.comparisonDigest}`,
			json: false,
			runsDirectory: fixture.runsDirectory,
		},
		recorder.output,
		NO_CORPUS,
	);

	const stdout = recorder.stdout.join("");

	expect(stdout).toContain("| candidate − baseline | build |");
	expect(stdout).toContain("| candidate − control | build |");
	expect(stdout).toContain("| baseline − control | build |");
}

async function namesTheLegacyDefaultCaseInItsSummary(): Promise<void> {
	const fixture = await workspace.writtenRecords();
	await fixture.confirmations.records.writeGroupWithoutCaseId("group-legacy");
	await fixture.confirmations.records.writeGroupReport("group-legacy");

	const recorder = recordOutput();

	await runShow(
		{
			id: "group:group-legacy",
			json: false,
			runsDirectory: fixture.runsDirectory,
		},
		recorder.output,
		NO_CORPUS,
	);

	const stdout = recorder.stdout.join("");

	expect(stdout).toContain("Case audit-log");
	expect(stdout).toContain("success rate");
	expect(stdout).toContain("pass^k");
}

async function namesTheReportRatherThanClaimingTheGroupDoes(): Promise<void> {
	const fixture = await workspace.writtenRecords();
	await fixture.confirmations.records.writeGroupWithoutCaseId(
		"group-no-report",
	);
	const recorder = recordOutput();

	const failure = await failureOf(
		runShow(
			{
				id: "group:group-no-report",
				json: false,
				runsDirectory: fixture.runsDirectory,
			},
			recorder.output,
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toContain("report.json");
	expect(failure.message).not.toContain("No record group:group-no-report");
}

async function stillPrintsTheGroupRecordSOwnBytesWith(): Promise<void> {
	const fixture = await workspace.writtenRecords();
	await fixture.confirmations.records.writeGroupWithoutCaseId(
		"group-no-report",
	);
	const paths = confirmationGroupPaths(
		fixture.runsDirectory,
		"group-no-report",
	);

	const recorder = recordOutput();

	await runShow(
		{
			id: "group:group-no-report",
			json: true,
			runsDirectory: fixture.runsDirectory,
		},
		recorder.output,
		NO_CORPUS,
	);

	const stdout = recorder.stdout.join("");

	expect(stdout).toBe(await Bun.file(paths.groupFile).text());
}

function whenTheGroupRecordWasWrittenWithoutACaseIdCases(): void {
	it(
		"names the legacy default case in its summary",
		namesTheLegacyDefaultCaseInItsSummary,
	);
}

function whenAGroupsReportIsMissingButItsRecordIsNotCases(): void {
	it(
		"names the report rather than claiming the group does not exist",
		namesTheReportRatherThanClaimingTheGroupDoes,
	);
	it(
		"still prints the group record's own bytes with --json",
		stillPrintsTheGroupRecordSOwnBytesWith,
	);
}

function whenARunHoldsNoRecord(): void {
	it(
		"refuses a run with no record of any kind by name, not with a raw filesystem error",
		refusesARunWithNoRecordOfAnyKind,
	);
}

function runShowCases(): void {
	it(
		"prints the record that exists on disk for a run that stopped at a stage",
		printsTheRecordThatExistsOnDiskForA,
	);
	it(
		"prints a stopped run's stage record rather than a run summary without --json",
		printsAStoppedRunSStageRecordRatherThan,
	);
	it(
		"prints a run's stages, grades, verdict, and total cost without --json",
		printsARunSStagesGradesVerdictAndTotal,
	);
	it(
		"prints a comparison's paired deltas beside the control arm without --json",
		printsAComparisonSPairedDeltasBesideTheControl,
	);
	describe(
		"when the group record was written without a case id",
		whenTheGroupRecordWasWrittenWithoutACaseIdCases,
	);
	describe(
		"when a group's report is missing but its record is not",
		whenAGroupsReportIsMissingButItsRecordIsNotCases,
	);
	describe("when a run holds no record", whenARunHoldsNoRecord);
}

describe(runShow.name, runShowCases);
