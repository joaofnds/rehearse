import { describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { basename, join } from "node:path";

import { CONTROL_DIR } from "#benchmark/config";
import { RecordedRunsFixture } from "#benchmark/run-records-test-support";
import { CliTestWorkspace, recordOutput } from "#cli/cli-test-support";
import { runList } from "#cli/list-command";

import { PREFIX_START_INDEX } from "./list-comparison-test-fixture";

const workspace = CliTestWorkspace.forEachTest();

const IDENTITY_AND_STATUS_COLUMN_COUNT = 2;

function lines(stdout: readonly string[]): readonly string[] {
	const text = stdout.join("");

	return text === "" ? [] : text.trimEnd().split("\n");
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

async function damagedFixture(): Promise<RecordedRunsFixture> {
	const root = await mkdtemp(join(CONTROL_DIR, "rehearse-list-test-"));
	workspace.track(root);
	const fixture = new RecordedRunsFixture(root);
	await fixture.write();
	await fixture.claim("audit-log", fixture.auditLogClaims);
	await fixture.claim("smoke", fixture.smokeClaims);
	const claims = join(root, "short-ids", "smoke", "claims");
	await rm(claims, { recursive: true });
	await Bun.write(claims, "");

	return fixture;
}

async function unlistableFixture(): Promise<RecordedRunsFixture> {
	const root = await mkdtemp(join(CONTROL_DIR, "rehearse-list-test-"));
	workspace.track(root);
	const fixture = new RecordedRunsFixture(root);
	await fixture.write();
	await Bun.write(join(root, "short-ids"), "");

	return fixture;
}

async function printsTheOtherCaseSShortIdsAndNone(): Promise<void> {
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
	} = listingArrangement(await damagedFixture());

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
		`attempt:session:${caseId}/${uuid}\t-`,
		`attempt:stage:${lineage}/${timestamp}\taudit-log/r3`,
	]);
	await runList({ kind: "groups", runsDirectory }, outputs.groups.output);

	expect(columns(outputs.groups.stdout)).toEqual([
		`group:${groupId}\taudit-log/g4`,
	]);
}

async function printsEveryRecordWithoutAShortId(): Promise<void> {
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
	} = listingArrangement(await unlistableFixture());

	await runList({ kind: "runs", runsDirectory }, outputs.runs.output);

	expect(columns(outputs.runs.stdout)).toEqual([
		`run:${unreplayableRun}\t-`,
		`run:${replayableRun}\t-`,
	]);
	await runList(
		{ kind: "checkpoints", runsDirectory },
		outputs.checkpoints.output,
	);

	expect(columns(outputs.checkpoints.stdout)).toEqual([
		`checkpoint:${replayableRun}/build\t-`,
		`checkpoint:${replayableRun}/discuss\t-`,
	]);
	await runList({ kind: "attempts", runsDirectory }, outputs.attempts.output);

	expect(columns(outputs.attempts.stdout)).toEqual([
		`attempt:session:${caseId}/${uuid}\t-`,
		`attempt:stage:${lineage}/${timestamp}\t-`,
	]);
	await runList({ kind: "groups", runsDirectory }, outputs.groups.output);

	expect(columns(outputs.groups.stdout)).toEqual([`group:${groupId}\t-`]);
}

function whenOneCasesShortIdRegistryCannotBeReadCases(): void {
	it(
		"prints the other case's short ids and none for the damaged case's records",
		printsTheOtherCaseSShortIdsAndNone,
	);
	it.each(["runs", "checkpoints", "attempts", "groups"] as const)(
		"names the damaged case's registry once on stderr for %s",
		async (kind) => {
			const fixture = await damagedFixture();
			const recorder = recordOutput();

			await runList(
				{ kind, runsDirectory: fixture.runsDirectory },
				recorder.output,
			);

			expect(lines(recorder.stderr)).toEqual([
				`short-ids/smoke: ENOTDIR: not a directory, scandir '${basename(fixture.runsDirectory)}/short-ids/smoke/claims'`,
			]);
		},
	);
}

function whenTheCasesShortIdRegistriesCannotBeListedCases(): void {
	it(
		"prints every record without a short id",
		printsEveryRecordWithoutAShortId,
	);
	it.each(["runs", "checkpoints", "attempts", "groups"] as const)(
		"names the registries once on stderr for %s",
		async (kind) => {
			const fixture = await unlistableFixture();
			const recorder = recordOutput();

			await runList(
				{ kind, runsDirectory: fixture.runsDirectory },
				recorder.output,
			);

			expect(lines(recorder.stderr)).toEqual([
				`short-ids: ENOTDIR: not a directory, scandir '${basename(fixture.runsDirectory)}/short-ids'`,
			]);
		},
	);
}

function registryCases(): void {
	describe(
		"when one case's short id registry cannot be read",
		whenOneCasesShortIdRegistryCannotBeReadCases,
	);
	describe(
		"when the cases' short id registries cannot be listed",
		whenTheCasesShortIdRegistriesCannotBeListedCases,
	);
}

function numberedCases(): void {
	describe("when the records' cases are numbered", registryCases);
}

describe(runList.name, numberedCases);
