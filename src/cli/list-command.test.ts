import { describe, expect, it } from "bun:test";

import { DEFAULT_CASE_ID } from "#benchmark/config";
import { CliTestWorkspace, recordOutput } from "#cli/cli-test-support";
import { runList } from "#cli/list-command";

const workspace = CliTestWorkspace.forEachTest();

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

async function emptyRunsDirectory(): Promise<string> {
	return await workspace.createDirectory("rehearse-list-empty-");
}

async function printsActiveCasesWithTheirIdsAndTitlesOmitting(): Promise<void> {
	const recorder = recordOutput();

	await runList(
		{ kind: "cases", runsDirectory: await emptyRunsDirectory() },
		recorder.output,
	);

	expect(ids(recorder.stdout)).toContain(`case:${DEFAULT_CASE_ID}`);
	expect(ids(recorder.stdout)).toContain("case:own-work-build");
	expect(ids(recorder.stdout)).not.toContain("case:smoke");
}

async function marksARunWithoutAManifestAsNotReplayable(): Promise<void> {
	const fixture = await workspace.writtenRecords();
	const recorder = recordOutput();

	await runList(
		{ kind: "runs", runsDirectory: fixture.runsDirectory },
		recorder.output,
	);

	expect(lines(recorder.stdout)).toEqual([
		`run:${fixture.unreplayableRun}\t-\taudit-log\tFAILED\tnot replayable`,
		`run:${fixture.replayableRun}\t-\taudit-log\tCOMPLETE\treplayable`,
	]);
}

async function namesARunThatStoppedAtAStageNaming(): Promise<void> {
	const fixture = await workspace.writtenRecords();
	await fixture.stopped.writeStoppedRun();
	const recorder = recordOutput();

	await runList(
		{ kind: "runs", runsDirectory: fixture.runsDirectory },
		recorder.output,
	);

	expect(lines(recorder.stdout)).toContain(
		`run:${fixture.stoppedRun}\t-\taudit-log\tSTOPPED:build\treplayable`,
	);
}

async function reportsAStoppedRunWithoutAManifestAsUnreadable(): Promise<void> {
	const fixture = await workspace.writtenRecords();
	await fixture.stopped.writeStoppedRunWithoutManifest();
	const recorder = recordOutput();

	await runList(
		{ kind: "runs", runsDirectory: fixture.runsDirectory },
		recorder.output,
	);

	expect(ids(recorder.stdout)).not.toContain(`run:${fixture.stoppedRun}`);
	expect(recorder.stderr.join("")).toContain(`run:${fixture.stoppedRun}:`);
}

async function givesAStoppedRunWithoutAManifestAPlain(): Promise<void> {
	const fixture = await workspace.writtenRecords();
	await fixture.stopped.writeStoppedRunWithoutManifest();
	const recorder = recordOutput();

	await runList(
		{ kind: "runs", runsDirectory: fixture.runsDirectory },
		recorder.output,
	);

	const reasons = recorder.stderr.join("");
	expect(reasons).not.toContain("ENOENT");
	expect(reasons).toContain("incomplete");
}

async function givesARunWithNoRecordOfAnyKind(): Promise<void> {
	const fixture = await workspace.writtenRecords();
	await fixture.events.writeNoRecordRun();
	const recorder = recordOutput();

	await runList(
		{ kind: "runs", runsDirectory: fixture.runsDirectory },
		recorder.output,
	);

	expect(lines(recorder.stdout)).toContain(
		`run:${fixture.noRecordRun}\t-\tno record`,
	);
}

async function printsOneLinePerCheckpointOfEveryRecordedRun(): Promise<void> {
	const fixture = await workspace.writtenRecords();
	const recorder = recordOutput();

	await runList(
		{ kind: "checkpoints", runsDirectory: fixture.runsDirectory },
		recorder.output,
	);

	expect(lines(recorder.stdout)).toEqual([
		`checkpoint:${fixture.replayableRun}/build\t-\tbuild\tlineage-build`,
		`checkpoint:${fixture.replayableRun}/discuss\t-\tdiscuss\tlineage-discuss`,
	]);
}

describe(runList.name, () => {
	it(
		"prints active cases with their ids and titles, omitting archived diagnostics",
		printsActiveCasesWithTheirIdsAndTitlesOmitting,
	);
	it(
		"marks a run without a manifest as not replayable",
		marksARunWithoutAManifestAsNotReplayable,
	);
	it(
		"names a run that stopped at a stage, naming the stage and listing it replayable",
		namesARunThatStoppedAtAStageNaming,
	);
	it(
		"reports a stopped run without a manifest as unreadable rather than replayable",
		reportsAStoppedRunWithoutAManifestAsUnreadable,
	);
	it(
		"gives a stopped run without a manifest a plain incomplete reason, not a raw ENOENT",
		givesAStoppedRunWithoutAManifestAPlain,
	);
	it(
		"gives a run with no record of any kind a plain no-record line",
		givesARunWithNoRecordOfAnyKind,
	);
	it(
		"prints one line per checkpoint of every recorded run",
		printsOneLinePerCheckpointOfEveryRecordedRun,
	);
});
