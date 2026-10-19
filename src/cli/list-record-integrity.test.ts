import { describe, expect, it } from "bun:test";
import { homedir } from "node:os";
import { basename, join } from "node:path";

import {
	CliTestWorkspace,
	failureOf,
	recordOutput,
} from "#cli/cli-test-support";
import { UsageError } from "#cli/commands";
import { LIST_KINDS, runList } from "#cli/list-command";
import { parseRecordId } from "#cli/record-id";
import { runShow } from "#cli/show-command";

const workspace = CliTestWorkspace.forEachTest();

const RECORD_ID_COLUMN_INDEX = 0;

const RECORDLESS_UUID = "0f6b6f2a-0000-4000-8000-0000000000ff";

function lines(stdout: readonly string[]): readonly string[] {
	const text = stdout.join("");

	return text === "" ? [] : text.trimEnd().split("\n");
}

function ids(stdout: readonly string[]): readonly string[] {
	return lines(stdout).map(
		(line) => line.split("\t")[RECORD_ID_COLUMN_INDEX] ?? "",
	);
}

async function emptyRunsDirectory(): Promise<string> {
	return await workspace.createDirectory("rehearse-list-empty-");
}

async function printsOneLinePerAttemptOfBothKindsWith(): Promise<void> {
	const fixture = await workspace.writtenRecords();
	const recorder = recordOutput();

	await runList(
		{ kind: "attempts", runsDirectory: fixture.runsDirectory },
		recorder.output,
	);

	expect(lines(recorder.stdout)).toEqual([
		`attempt:session:${fixture.sessionAttempt.caseId}/${fixture.sessionAttempt.uuid}\t-\tsmoke\tSUCCESSFUL\tsonnet`,
		`attempt:stage:${fixture.stageAttempt.lineage}/${fixture.stageAttempt.timestamp}\t-\tbuild\tA CONTINUE\tsonnet`,
	]);
}

async function readsAnAttemptWhoseExactRepeatEvidenceHasA(): Promise<void> {
	const fixture = await workspace.writtenRecords();
	const recorder = recordOutput();

	await runList(
		{ kind: "attempts", runsDirectory: fixture.runsDirectory },
		recorder.output,
	);

	expect(lines(recorder.stdout)).toContain(
		`attempt:session:${fixture.sessionAttempt.caseId}/${fixture.sessionAttempt.uuid}\t-\tsmoke\tSUCCESSFUL\tsonnet`,
	);
	expect(recorder.stderr).toEqual([]);
}

async function stillPrintsTheValidLinesAndNamesTheUnreadable(): Promise<void> {
	const fixture = await workspace.writtenRecords();
	await fixture.confirmations.records.writeUnreadableGroup("group-broken");
	await fixture.confirmations.records.writeGroupWithoutCaseId("group-2");
	const recorder = recordOutput();

	await runList(
		{ kind: "groups", runsDirectory: fixture.runsDirectory },
		recorder.output,
	);

	expect(ids(recorder.stdout)).toEqual([
		`group:${fixture.groupId}`,
		"group:group-2",
	]);
	expect(recorder.stderr.join("")).toContain("group:group-broken");
}

async function stillPrintsTheRecordedAttemptsAndNamesItOn(): Promise<void> {
	const fixture = await workspace.writtenRecords();
	await fixture.sessions.writeEmptyAttemptDirectory({
		caseId: "smoke",
		uuid: RECORDLESS_UUID,
	});
	const recorder = recordOutput();

	await runList(
		{ kind: "attempts", runsDirectory: fixture.runsDirectory },
		recorder.output,
	);

	expect(ids(recorder.stdout)).toEqual([
		`attempt:session:${fixture.sessionAttempt.caseId}/${fixture.sessionAttempt.uuid}`,
		`attempt:stage:${fixture.stageAttempt.lineage}/${fixture.stageAttempt.timestamp}`,
	]);
	expect(recorder.stderr.join("")).toContain(
		`attempt:session:smoke/${RECORDLESS_UUID}`,
	);
}

async function givesTheMissingRecordAPlainIncompleteReasonNotAgain(): Promise<void> {
	const fixture = await workspace.writtenRecords();
	await fixture.sessions.writeEmptyAttemptDirectory({
		caseId: "smoke",
		uuid: RECORDLESS_UUID,
	});
	const recorder = recordOutput();

	await runList(
		{ kind: "attempts", runsDirectory: fixture.runsDirectory },
		recorder.output,
	);

	const reasons = recorder.stderr.join("");
	expect(reasons).not.toContain("ENOENT");
	expect(reasons).toContain("incomplete");
}

async function namesItRelativeToTheControlRoot(): Promise<void> {
	const fixture = await workspace.recordFixtureUnderControl(
		"rehearse-list-test-",
	);
	const root = fixture.runsDirectory;
	await fixture.stopped.writeStoppedRunWithoutManifest();
	const recorder = recordOutput();

	await runList({ kind: "runs", runsDirectory: root }, recorder.output);

	const reasons = recorder.stderr.join("");
	expect(reasons).toContain(
		`${basename(root)}/${fixture.stoppedRun}.checkpoints/manifest.json`,
	);
	expect(reasons).not.toContain(homedir());
}

async function refusesItAsAUsageErrorNamingTheAccepted(): Promise<void> {
	const recorder = recordOutput();

	const failure = await failureOf(
		runList(
			{ kind: "bogus", runsDirectory: await emptyRunsDirectory() },
			recorder.output,
		),
	);

	expect(failure).toBeInstanceOf(UsageError);
	expect(failure.message).toContain("cases");
	expect(failure.message).toContain("comparisons");
	expect(recorder.stdout).toEqual([]);
}

function whenOneRecordCannotBeReadCases(): void {
	it(
		"still prints the valid lines and names the unreadable one on stderr",
		stillPrintsTheValidLinesAndNamesTheUnreadable,
	);
}

function whenAnAttemptDirectoryHoldsNoRecordCases(): void {
	it(
		"still prints the recorded attempts and names it on stderr",
		stillPrintsTheRecordedAttemptsAndNamesItOn,
	);
	it(
		"gives the missing record a plain incomplete reason, not a raw ENOENT",
		givesTheMissingRecordAPlainIncompleteReasonNotAgain,
	);
}

function whenAReasonNamesAFileUnderTheControlRootCases(): void {
	it("names it relative to the control root", namesItRelativeToTheControlRoot);
}

function whenNothingHasBeenRecordedCases(): void {
	it.each([
		"runs",
		"checkpoints",
		"attempts",
		"groups",
		"archived-groups",
		"comparisons",
	] as const)("prints nothing for %s", async (kind) => {
		const recorder = recordOutput();

		await runList(
			{ kind, runsDirectory: join(await emptyRunsDirectory(), "absent") },
			recorder.output,
		);

		expect(recorder.stdout).toEqual([]);
	});
}

function whenTheKindIsNotAcceptedCases(): void {
	it(
		"refuses it as a usage error naming the accepted kinds",
		refusesItAsAUsageErrorNamingTheAccepted,
	);
}

function runListCases(): void {
	it(
		"prints one line per attempt of both kinds with its case, outcome, and model",
		printsOneLinePerAttemptOfBothKindsWith,
	);
	it(
		"reads an attempt whose exact-repeat evidence has a maximum-length preview",
		readsAnAttemptWhoseExactRepeatEvidenceHasA,
	);
	it.each(LIST_KINDS.filter((kind) => kind !== "archived-groups"))(
		"prints ids show accepts back for %s",
		async (kind) => {
			const lowerBoundForPrintedCount = 0;

			const fixture = await workspace.writtenRecords();
			const recorder = recordOutput();
			await runList(
				{ kind, runsDirectory: fixture.runsDirectory },
				recorder.output,
			);
			const printed = ids(recorder.stdout);

			expect(printed.length).toBeGreaterThan(lowerBoundForPrintedCount);
			await Array.fromAsync(printed, async (id) => {
				const shown = recordOutput();
				await runShow(
					{ id, json: true, runsDirectory: fixture.runsDirectory },
					shown.output,
				);

				expect(shown.stdout.join("")).not.toBe("");
				expect(parseRecordId(id)).toBeDefined();
			});
		},
	);
	describe("when one record cannot be read", whenOneRecordCannotBeReadCases);
	describe(
		"when an attempt directory holds no record",
		whenAnAttemptDirectoryHoldsNoRecordCases,
	);
	describe(
		"when a reason names a file under the control root",
		whenAReasonNamesAFileUnderTheControlRootCases,
	);
	describe("when nothing has been recorded", whenNothingHasBeenRecordedCases);
	describe("when the kind is not accepted", whenTheKindIsNotAcceptedCases);
}

describe(runList.name, runListCases);
