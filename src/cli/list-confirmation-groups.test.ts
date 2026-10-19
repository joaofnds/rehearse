import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { archiveConfirmation } from "#benchmark/confirmation-archive";
import { operatorStopRecord } from "#benchmark/operator-stop";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import type { RecordedRunsFixture } from "#benchmark/run-records-test-support";
import { CliTestWorkspace, recordOutput } from "#cli/cli-test-support";
import { runList } from "#cli/list-command";

import { PREFIX_START_INDEX } from "./list-comparison-test-fixture";

const workspace = CliTestWorkspace.forEachTest();

const IDENTITY_AND_STATUS_COLUMN_COUNT = 2;

const RECORD_ID_COLUMN_INDEX = 0;

function lines(stdout: readonly string[]): readonly string[] {
	const text = stdout.join("");

	return text === "" ? [] : text.trimEnd().split("\n");
}

function ids(stdout: readonly string[]): readonly string[] {
	return lines(stdout).map(
		(line) => line.split("\t")[RECORD_ID_COLUMN_INDEX] ?? "",
	);
}

async function numberedFixture(): Promise<RecordedRunsFixture> {
	const fixture = await workspace.writtenRecords();
	await fixture.claim("audit-log", fixture.auditLogClaims);
	await fixture.claim("smoke", fixture.smokeClaims);

	return fixture;
}

function columns(stdout: readonly string[]): readonly string[] {
	return lines(stdout).map((line) =>
		line
			.split("\t")
			.slice(PREFIX_START_INDEX, IDENTITY_AND_STATUS_COLUMN_COUNT)
			.join("\t"),
	);
}

async function labelsTheCheckpointTakenAfterTaskSetupS0(): Promise<void> {
	const fixture = await numberedFixture();
	await fixture.pipeline.writeInitialCheckpoint();

	const recorder = recordOutput();

	await runList(
		{ kind: "checkpoints", runsDirectory: fixture.runsDirectory },
		recorder.output,
	);

	expect(columns(recorder.stdout)).toContain(
		`checkpoint:${fixture.replayableRun}/initial\taudit-log/r2/s0`,
	);
}

async function stillPrintsTheRecordedCheckpointsAndNamesItOn(): Promise<void> {
	const fixture = await workspace.writtenRecords();
	await fixture.pipeline.writeEmptyCheckpointDirectory("zz-empty");
	const recorder = recordOutput();

	await runList(
		{ kind: "checkpoints", runsDirectory: fixture.runsDirectory },
		recorder.output,
	);

	expect(ids(recorder.stdout)).toEqual([
		`checkpoint:${fixture.replayableRun}/build`,
		`checkpoint:${fixture.replayableRun}/discuss`,
	]);
	expect(recorder.stderr.join("")).toContain(
		`checkpoint:${fixture.replayableRun}/zz-empty`,
	);
}

async function givesTheMissingRecordAPlainIncompleteReasonNot(): Promise<void> {
	const fixture = await workspace.writtenRecords();
	await fixture.pipeline.writeEmptyCheckpointDirectory("zz-empty");
	const recorder = recordOutput();

	await runList(
		{ kind: "checkpoints", runsDirectory: fixture.runsDirectory },
		recorder.output,
	);

	const reasons = recorder.stderr.join("");
	expect(reasons).not.toContain("ENOENT");
	expect(reasons).toContain("incomplete");
}

async function printsOneLinePerConfirmationGroupWithItsCase(): Promise<void> {
	const fixture = await workspace.writtenRecords();
	const recorder = recordOutput();

	await runList(
		{ kind: "groups", runsDirectory: fixture.runsDirectory },
		recorder.output,
	);

	expect(lines(recorder.stdout)).toEqual([
		`group:${fixture.groupId}\t-\taudit-log\tstage\t2 reps`,
	]);
}

async function leavesOutAGroupTheOperatorStoppedBeforeIts(): Promise<void> {
	const fixture = await workspace.writtenRecords();
	const recorder = recordOutput();
	const stopped = confirmationGroupPaths(
		fixture.runsDirectory,
		"group-stopped",
	);
	await Bun.write(stopped.operatorStopFile, operatorStopRecord("SIGTERM"));

	await runList(
		{ kind: "groups", runsDirectory: fixture.runsDirectory },
		recorder.output,
	);

	expect(lines(recorder.stdout)).toEqual([
		`group:${fixture.groupId}\t-\taudit-log\tstage\t2 reps`,
	]);
	expect(recorder.stderr.join("")).not.toContain("group-stopped");
}

async function printsExplicitArchivesSeparatelyWithTheirStableGroupID(): Promise<void> {
	const fixture = await workspace.writtenRecords();
	const group = confirmationGroupPaths(fixture.runsDirectory, "reviewed-group");
	await Bun.write(join(group.inputsDirectory, "input.txt"), "saved input");
	await archiveConfirmation({
		archivedAt: "2026-10-18T12:00:00.000Z",
		groupId: "reviewed-group",
		runsDirectory: fixture.runsDirectory,
	});
	const recorder = recordOutput();

	await runList(
		{ kind: "archived-groups", runsDirectory: fixture.runsDirectory },
		recorder.output,
	);

	expect(lines(recorder.stdout)).toEqual([
		"group:reviewed-group\t2026-10-18T12:00:00.000Z\tno saved summary",
	]);
	expect(recorder.stderr).toEqual([]);
}

async function isolatesAMalformedOperatorStopRecordWithoutHidingValid(): Promise<void> {
	const fixture = await workspace.writtenRecords();
	await Bun.write(
		confirmationGroupPaths(fixture.runsDirectory, "bad-stop").operatorStopFile,
		"not-json",
	);
	const recorder = recordOutput();

	await runList(
		{ kind: "groups", runsDirectory: fixture.runsDirectory },
		recorder.output,
	);

	expect(ids(recorder.stdout)).toEqual([`group:${fixture.groupId}`]);
	expect(recorder.stderr.join("")).toContain("group:bad-stop");
}

function whenTheRecordsCasesAreNumberedCases(): void {
	it(
		"labels the checkpoint taken after task setup s0",
		labelsTheCheckpointTakenAfterTaskSetupS0,
	);
}

function whenACheckpointStageDirectoryHoldsNoRecordCases(): void {
	it(
		"still prints the recorded checkpoints and names it on stderr",
		stillPrintsTheRecordedCheckpointsAndNamesItOn,
	);
	it(
		"gives the missing record a plain incomplete reason, not a raw ENOENT",
		givesTheMissingRecordAPlainIncompleteReasonNot,
	);
}

function whenAGroupWasStoppedBeforeItsRecord(): void {
	it(
		"leaves out a group the operator stopped before its group record",
		leavesOutAGroupTheOperatorStoppedBeforeIts,
	);
}

function whenAnOperatorStopRecordIsMalformed(): void {
	it(
		"isolates a malformed operator-stop record without hiding valid groups",
		isolatesAMalformedOperatorStopRecordWithoutHidingValid,
	);
}

function runListCases(): void {
	it(
		"prints one line per confirmation group with its case, mode, and rep count",
		printsOneLinePerConfirmationGroupWithItsCase,
	);
	it(
		"prints explicit archives separately with their stable group ID and timestamp",
		printsExplicitArchivesSeparatelyWithTheirStableGroupID,
	);
	describe(
		"when the records' cases are numbered",
		whenTheRecordsCasesAreNumberedCases,
	);
	describe(
		"when a checkpoint stage directory holds no record",
		whenACheckpointStageDirectoryHoldsNoRecordCases,
	);
	describe(
		"when a group was stopped before its record",
		whenAGroupWasStoppedBeforeItsRecord,
	);
	describe(
		"when an operator-stop record is malformed",
		whenAnOperatorStopRecordIsMalformed,
	);
}

describe(runList.name, runListCases);
