import { describe, expect, it } from "bun:test";

import { benchmarkRunPaths } from "#benchmark/run-layout";
import type { RecordedRunsFixture } from "#benchmark/run-records-test-support";
import { CliTestWorkspace, recordOutput } from "#cli/cli-test-support";
import { runList } from "#cli/list-command";

import { PREFIX_START_INDEX } from "./list-comparison-test-fixture";

const workspace = CliTestWorkspace.forEachTest();

const IDENTITY_AND_STATUS_COLUMN_COUNT = 2;

function lines(stdout: readonly string[]): readonly string[] {
	const text = stdout.join("");

	return text === "" ? [] : text.trimEnd().split("\n");
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

interface ListingArrangement {
	readonly caseId: string;
	readonly groupId: string;
	readonly lineage: string;
	readonly outputs: {
		readonly attempts: ReturnType<typeof recordOutput>;
		readonly checkpoints: ReturnType<typeof recordOutput>;
		readonly groups: ReturnType<typeof recordOutput>;
		readonly runs: ReturnType<typeof recordOutput>;
	};
	readonly replayableRun: string;
	readonly runsDirectory: string;
	readonly timestamp: string;
	readonly unreplayableRun: string;
	readonly uuid: string;
}

function listingArrangement(fixture: RecordedRunsFixture): ListingArrangement {
	return {
		caseId: fixture.sessionAttempt.caseId,
		groupId: fixture.groupId,
		lineage: fixture.stageAttempt.lineage,
		outputs: {
			attempts: recordOutput(),
			checkpoints: recordOutput(),
			groups: recordOutput(),
			runs: recordOutput(),
		},
		replayableRun: fixture.replayableRun,
		runsDirectory: fixture.runsDirectory,
		timestamp: fixture.stageAttempt.timestamp,
		unreplayableRun: fixture.unreplayableRun,
		uuid: fixture.sessionAttempt.uuid,
	};
}

async function printsEachRecordSShortIdBesideItsRecord(): Promise<void> {
	const {
		runsDirectory,
		replayableRun,
		unreplayableRun,
		lineage,
		timestamp,
		caseId,
		uuid,
		groupId,
		outputs,
	} = listingArrangement(await numberedFixture());

	await runList({ kind: "runs", runsDirectory }, outputs.runs.output);

	expect(columns(outputs.runs.stdout)).toEqual([
		`run:${unreplayableRun}\taudit-log/r1`,
		`run:${replayableRun}\taudit-log/r2`,
	]);
	await runList(
		{ kind: "checkpoints", runsDirectory },
		outputs.checkpoints.output,
	);

	expect(columns(outputs.checkpoints.stdout)).toEqual([
		`checkpoint:${replayableRun}/build\taudit-log/r2/s2`,
		`checkpoint:${replayableRun}/discuss\taudit-log/r2/s1`,
	]);
	await runList({ kind: "attempts", runsDirectory }, outputs.attempts.output);

	expect(columns(outputs.attempts.stdout)).toEqual([
		`attempt:session:${caseId}/${uuid}\tsmoke/r1`,
		`attempt:stage:${lineage}/${timestamp}\taudit-log/r3`,
	]);
	await runList({ kind: "groups", runsDirectory }, outputs.groups.output);

	expect(columns(outputs.groups.stdout)).toEqual([
		`group:${groupId}\taudit-log/g4`,
	]);
}

async function stillListsItsCheckpointsWithoutAShortId(): Promise<void> {
	const { runsDirectory, replayableRun, outputs } = listingArrangement(
		await numberedFixture(),
	);

	await Bun.write(
		benchmarkRunPaths(runsDirectory, replayableRun).manifestFile,
		"{ not json\n",
	);

	await runList(
		{ kind: "checkpoints", runsDirectory },
		outputs.checkpoints.output,
	);

	expect(columns(outputs.checkpoints.stdout)).toEqual([
		`checkpoint:${replayableRun}/build\t-`,
		`checkpoint:${replayableRun}/discuss\t-`,
	]);
}

function whenANumberedRunsManifestCannotBeReadCases(): void {
	it(
		"still lists its checkpoints, without a short id",
		stillListsItsCheckpointsWithoutAShortId,
	);
}

function whenTheRecordsCasesAreNumberedCases(): void {
	it(
		"prints each record's short id beside its Record ID",
		printsEachRecordSShortIdBesideItsRecord,
	);
	describe(
		"when a numbered run's manifest cannot be read",
		whenANumberedRunsManifestCannotBeReadCases,
	);
}

function runListCases(): void {
	describe(
		"when the records' cases are numbered",
		whenTheRecordsCasesAreNumberedCases,
	);
}

describe(runList.name, runListCases);
