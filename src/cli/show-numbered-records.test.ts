import { describe, expect, it } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { benchmarkRunPaths } from "#benchmark/run-layout";
import type { RecordedRunsFixture } from "#benchmark/run-records-test-support";
import {
	CliTestWorkspace,
	failureOf,
	recordOutput,
} from "#cli/cli-test-support";
import { UsageError } from "#cli/command-usage";
import { runShow } from "#cli/show-command";

import { NO_CORPUS } from "./show-record-test-driver";

const workspace = CliTestWorkspace.forEachTest();

interface ShortRecordRow {
	readonly shortId: string;
	readonly canonicalId: (fixture: RecordedRunsFixture) => string;
}

const shortRecordRows: readonly ShortRecordRow[] = [
	{
		canonicalId: (fixture) => `run:${fixture.replayableRun}`,
		shortId: "audit-log/r2",
	},
	{
		canonicalId: (fixture) => `checkpoint:${fixture.replayableRun}/initial`,
		shortId: "audit-log/r2/s0",
	},
	{
		canonicalId: (fixture) => `checkpoint:${fixture.replayableRun}/build`,
		shortId: "audit-log/r2/s2",
	},
	{
		canonicalId: (fixture) =>
			`attempt:stage:${fixture.stageAttempt.lineage}/${fixture.stageAttempt.timestamp}`,
		shortId: "audit-log/r3",
	},
	{
		canonicalId: (fixture) => `group:${fixture.groupId}`,
		shortId: "audit-log/g4",
	},
	{
		canonicalId: (fixture) =>
			`attempt:session:${fixture.sessionAttempt.caseId}/${fixture.sessionAttempt.uuid}`,
		shortId: "smoke/r1",
	},
];

async function numberedFixture(): Promise<RecordedRunsFixture> {
	const fixture = await workspace.writtenRecords();
	await fixture.claim("audit-log", fixture.auditLogClaims);
	await fixture.claim("smoke", fixture.smokeClaims);

	return fixture;
}

async function refusesANumberNoRecordHoldsNamingTheId(): Promise<void> {
	const fixture = await numberedFixture();

	const failure = await failureOf(
		runShow(
			{
				id: "audit-log/r99",
				json: false,
				runsDirectory: fixture.runsDirectory,
			},
			recordOutput().output,
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toContain("audit-log/r99");
}

async function refusesAStageTheRunSPipelineDoesNot(): Promise<void> {
	const fixture = await numberedFixture();

	const failure = await failureOf(
		runShow(
			{
				id: "audit-log/r2/s9",
				json: false,
				runsDirectory: fixture.runsDirectory,
			},
			recordOutput().output,
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toContain("audit-log/r2/s9");
}

async function refusesAStageOfARecordThatIsNot(): Promise<void> {
	const fixture = await numberedFixture();

	const failure = await failureOf(
		runShow(
			{
				id: "audit-log/r3/s1",
				json: false,
				runsDirectory: fixture.runsDirectory,
			},
			recordOutput().output,
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toContain("attempt:stage");
}

async function refusesAStageOfARunWhoseManifestCannot(): Promise<void> {
	const fixture = await numberedFixture();
	await Bun.write(
		benchmarkRunPaths(fixture.runsDirectory, fixture.replayableRun)
			.manifestFile,
		"{ not json\n",
	);

	const failure = await failureOf(
		runShow(
			{
				id: "audit-log/r2/s1",
				json: false,
				runsDirectory: fixture.runsDirectory,
			},
			recordOutput().output,
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toContain("manifest");
}

async function refusesAMalformedCaseSegmentAndCreatesOrOpens(): Promise<void> {
	const root = await workspace.createDirectory("rehearse-show-");
	const runsDirectory = join(root, "runs");

	const failure = await failureOf(
		runShow(
			{ id: "../x/r1", json: false, runsDirectory },
			recordOutput().output,
		),
	);

	expect(failure).toBeInstanceOf(UsageError);
	expect(await readdir(root)).toEqual([]);
}

interface ShortRecordCase extends ShortRecordRow {
	readonly json: boolean;
}

async function printsTheCanonicalRecordForAShortId({
	shortId,
	canonicalId,
	json,
}: ShortRecordCase): Promise<void> {
	const fixture = await numberedFixture();
	const short = recordOutput();
	const canonical = recordOutput();
	await fixture.pipeline.writeInitialCheckpoint(fixture.replayableRun);

	await runShow(
		{ id: shortId, json, runsDirectory: fixture.runsDirectory },
		short.output,
		NO_CORPUS,
	);
	await runShow(
		{
			id: canonicalId(fixture),
			json,
			runsDirectory: fixture.runsDirectory,
		},
		canonical.output,
		NO_CORPUS,
	);

	expect(short.stdout.join("")).toBe(canonical.stdout.join(""));
}

function refusedShortIds(): void {
	it(
		"refuses a number no record holds, naming the id as typed",
		refusesANumberNoRecordHoldsNamingTheId,
	);
	it(
		"refuses a stage the run's pipeline does not have",
		refusesAStageTheRunSPipelineDoesNot,
	);
	it(
		"refuses a stage of a record that is not a run, naming its kind",
		refusesAStageOfARecordThatIsNot,
	);
	it(
		"refuses a stage of a run whose manifest cannot be read",
		refusesAStageOfARunWhoseManifestCannot,
	);
	it(
		"refuses a malformed case segment and creates or opens no path",
		refusesAMalformedCaseSegmentAndCreatesOrOpens,
	);
}

function whenGivenAShortIdCases(): void {
	it.each(
		shortRecordRows.flatMap((row) => [
			{ ...row, json: true },
			{ ...row, json: false },
		]),
	)(
		"prints what the Record ID prints for $shortId, --json $json",
		printsTheCanonicalRecordForAShortId,
	);
	describe("when the short id names no usable record", refusedShortIds);
}

function runShowCases(): void {
	describe("when given a short id", whenGivenAShortIdCases);
}

describe(runShow.name, runShowCases);
