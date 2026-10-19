import { describe, expect, it } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";

import { caseDeclarationPath, casesRoot } from "#benchmark/case";
import { CONTROL_DIR, DEFAULT_CASE_ID } from "#benchmark/config";
import {
	benchmarkRunPaths,
	benchmarkRunsDirectory,
	comparisonReportPaths,
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

async function namesAnAbsentRecordSPathRelativeToThe(): Promise<void> {
	const recorder = recordOutput();

	const failure = await failureOf(
		runShow(
			{
				id: "run:absent",
				json: true,
				runsDirectory: benchmarkRunsDirectory(CONTROL_DIR),
			},
			recorder.output,
		),
	);

	expect(failure.message).toContain(".benchmark-runs/absent.json");
	expect(failure.message).not.toContain(homedir());
}

async function printsExactlyTheRunArtifactSBytesWithJson(): Promise<void> {
	const fixture = await workspace.writtenRecords();
	const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.replayableRun);

	const recorder = recordOutput();

	await runShow(
		{
			id: `run:${fixture.replayableRun}`,
			json: true,
			runsDirectory: fixture.runsDirectory,
		},
		recorder.output,
		NO_CORPUS,
	);

	const stdout = recorder.stdout.join("");

	expect(stdout).toBe(await Bun.file(paths.artifactFile).text());
	expect(() => {
		JSON.parse(stdout);
	}).not.toThrow();
}

async function printsExactlyTheCheckpointRecordSBytesWithJson(): Promise<void> {
	const fixture = await workspace.writtenRecords();
	const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.replayableRun);

	const recorder = recordOutput();

	await runShow(
		{
			id: `checkpoint:${fixture.replayableRun}/build`,
			json: true,
			runsDirectory: fixture.runsDirectory,
		},
		recorder.output,
		NO_CORPUS,
	);

	const stdout = recorder.stdout.join("");

	const checkpointFile = join(
		paths.checkpointDirectory("build"),
		"checkpoint.json",
	);
	expect(stdout).toBe(await Bun.file(checkpointFile).text());
}

async function printsExactlyTheGroupRecordSBytesWithJson(): Promise<void> {
	const fixture = await workspace.writtenRecords();
	const paths = confirmationGroupPaths(fixture.runsDirectory, fixture.groupId);

	const recorder = recordOutput();

	await runShow(
		{
			id: `group:${fixture.groupId}`,
			json: true,
			runsDirectory: fixture.runsDirectory,
		},
		recorder.output,
		NO_CORPUS,
	);

	const stdout = recorder.stdout.join("");

	expect(stdout).toBe(await Bun.file(paths.groupFile).text());
}

async function printsExactlyTheComparisonReportSBytesWithJson(): Promise<void> {
	const fixture = await workspace.writtenRecords();
	const paths = comparisonReportPaths(
		fixture.runsDirectory,
		fixture.comparisonDigest,
	);

	const recorder = recordOutput();

	await runShow(
		{
			id: `comparison:${fixture.comparisonDigest}`,
			json: true,
			runsDirectory: fixture.runsDirectory,
		},
		recorder.output,
		NO_CORPUS,
	);

	const stdout = recorder.stdout.join("");

	expect(stdout).toBe(await Bun.file(paths.reportFile).text());
}

async function printsExactlyTheCaseDeclarationSBytesWithJson(): Promise<void> {
	const fixture = await workspace.writtenRecords();

	const recorder = recordOutput();

	await runShow(
		{
			id: `case:${DEFAULT_CASE_ID}`,
			json: true,
			runsDirectory: fixture.runsDirectory,
		},
		recorder.output,
		NO_CORPUS,
	);

	const stdout = recorder.stdout.join("");

	const declarationPath = caseDeclarationPath(DEFAULT_CASE_ID, casesRoot());
	expect(stdout).toBe(await Bun.file(declarationPath).text());
}

async function printsExactlyTheSessionAttemptRecordSBytesWith(): Promise<void> {
	const fixture = await workspace.writtenRecords();

	const recorder = recordOutput();

	await runShow(
		{
			id: `attempt:session:${fixture.sessionAttempt.caseId}/${fixture.sessionAttempt.uuid}`,
			json: true,
			runsDirectory: fixture.runsDirectory,
		},
		recorder.output,
		NO_CORPUS,
	);

	const stdout = recorder.stdout.join("");

	expect(stdout).toBe(await Bun.file(fixture.sessionAttemptFile).text());
}

async function printsExactlyTheStageReplayRecordSBytesWith(): Promise<void> {
	const fixture = await workspace.writtenRecords();

	const recorder = recordOutput();

	await runShow(
		{
			id: `attempt:stage:${fixture.stageAttempt.lineage}/${fixture.stageAttempt.timestamp}`,
			json: true,
			runsDirectory: fixture.runsDirectory,
		},
		recorder.output,
		NO_CORPUS,
	);

	const stdout = recorder.stdout.join("");

	expect(stdout).toBe(await Bun.file(fixture.stageAttemptFile).text());
}

describe("naming a record a session pastes onto a card", () => {
	it(
		"names an absent record's path relative to the control root",
		namesAnAbsentRecordSPathRelativeToThe,
	);
});

describe(runShow.name, () => {
	it(
		"prints exactly the run artifact's bytes with --json",
		printsExactlyTheRunArtifactSBytesWithJson,
	);
	it(
		"prints exactly the checkpoint record's bytes with --json",
		printsExactlyTheCheckpointRecordSBytesWithJson,
	);
	it(
		"prints exactly the group record's bytes with --json",
		printsExactlyTheGroupRecordSBytesWithJson,
	);
	it(
		"prints exactly the comparison report's bytes with --json",
		printsExactlyTheComparisonReportSBytesWithJson,
	);
	it(
		"prints exactly the case declaration's bytes with --json",
		printsExactlyTheCaseDeclarationSBytesWithJson,
	);
	it(
		"prints exactly the session attempt record's bytes with --json",
		printsExactlyTheSessionAttemptRecordSBytesWith,
	);
	it(
		"prints exactly the stage replay record's bytes with --json",
		printsExactlyTheStageReplayRecordSBytesWith,
	);
});
