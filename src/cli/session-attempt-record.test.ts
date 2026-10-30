import { describe, expect, it } from "bun:test";
import { basename, dirname } from "node:path";

import { z } from "zod";

import { parseSessionAttemptRecord } from "#benchmark/session-record";
import ABSENT_HOME from "#benchmark/session-setup-test-fixtures";
import { readShortIds } from "#benchmark/short-id";
import { runSessionDebugAttempt } from "#cli/session-run-command";

import SessionAttemptTestFiles from "./session-attempt-test-files";
import { SessionCaseBuilder, config } from "./session-case-test-fixture";
import { fakeClaude } from "./session-provider-test-fixture";

const files = SessionAttemptTestFiles.forEachTest();

async function writesOneRecordCarryingTheReplyTheTranscriptPathTheMetricsAndAResultPerCheck(): Promise<void> {
	const runs = await files.temporary("rehearse-runs-");
	const projects = await files.temporary("rehearse-projects-");

	const outcome = await runSessionDebugAttempt({
		config,
		home: ABSENT_HOME,
		projectsDirectory: projects,
		runClaude: fakeClaude(projects, "OK"),
		runsDirectory: runs,
		sessionCase: new SessionCaseBuilder().build(),
		spendCeilingUsd: 100,
	});

	expect(outcome.record).toMatchObject({
		caseId: "smoke",
		checks: [{ kind: "word-band", status: "PASS" }],
		effort: "low",
		model: "haiku",
		outcome: "SUCCESSFUL",
		reply: "OK",
		schemaVersion: 3,
	});
	expect(outcome.record.metrics).toMatchObject({ costUsd: 0.0011 });
	expect(outcome.record.transcriptDiagnostics).toEqual({
		issues: [],
		measuredLineCount: 1,
		prefixLinesExcluded: 0,
		repeatedBashCommands: [],
		sourceLineCount: 1,
		state: "complete",
		toolErrors: [],
		toolUseOccurrences: { byName: [], total: 0 },
	});
	expect(await Bun.file(outcome.record.transcriptFile).text()).toContain("OK");
}

async function claimsTheAttemptAShortIdInItsCase(): Promise<void> {
	const runs = await files.temporary("rehearse-runs-");
	const projects = await files.temporary("rehearse-projects-");

	const outcome = await runSessionDebugAttempt({
		config,
		home: ABSENT_HOME,
		projectsDirectory: projects,
		runClaude: fakeClaude(projects, "OK"),
		runsDirectory: runs,
		sessionCase: new SessionCaseBuilder().build(),
		spendCeilingUsd: 100,
	});

	expect(await readShortIds(runs, "smoke")).toEqual([
		{
			record: {
				caseId: "smoke",
				kind: "attempt:session",
				uuid: basename(dirname(outcome.recordFile)),
			},
			shortId: "smoke/r1",
		},
	]);
}

async function printsARecordThatParsesWithTheSchemaThatWroteIt(): Promise<void> {
	const spendCeilingUsd = 100;
	const runs = await files.temporary("rehearse-runs-");
	const projects = await files.temporary("rehearse-projects-");

	const outcome = await runSessionDebugAttempt({
		config,
		home: ABSENT_HOME,
		projectsDirectory: projects,
		runClaude: fakeClaude(projects, "OK"),
		runsDirectory: runs,
		sessionCase: new SessionCaseBuilder().build(),
		spendCeilingUsd,
	});

	const written = parseSessionAttemptRecord(
		await Bun.file(outcome.recordFile).text(),
	);
	expect(written).toEqual(outcome.record);
	expect(written.spendCeilingUsd).toBe(spendCeilingUsd);
}

async function writesTheInstantTheAttemptStartedToItsRecordFile(): Promise<void> {
	const runs = await files.temporary("rehearse-runs-");
	const projects = await files.temporary("rehearse-projects-");
	// The provider's session takes ten minutes, so a start time read after it
	// began names a later minute.
	const startedAt = Date.parse("2026-10-08T10:15:00.000Z");
	const providerDurationMs = 600_000;
	let elapsedMs = 0;
	const claude = fakeClaude(projects, "OK");

	const outcome = await runSessionDebugAttempt({
		config,
		home: ABSENT_HOME,
		now: () => elapsedMs,
		projectsDirectory: projects,
		runClaude: async (command, cwd) => {
			elapsedMs += providerDurationMs;

			return await claude(command, cwd);
		},
		runsDirectory: runs,
		sessionCase: new SessionCaseBuilder().build(),
		spendCeilingUsd: 100,
		wallClock: () => startedAt + elapsedMs,
	});

	const written = z
		.object({ elapsedMs: z.number(), startedAt: z.iso.datetime() })
		.parse(JSON.parse(await Bun.file(outcome.recordFile).text()));
	expect(written.startedAt).toBe("2026-10-08T10:15:00.000Z");
	expect(written.elapsedMs).toBe(providerDurationMs);
}

describe(runSessionDebugAttempt.name, () => {
	it(
		"writes one record carrying the reply, the transcript path, the metrics, and a result per check",
		writesOneRecordCarryingTheReplyTheTranscriptPathTheMetricsAndAResultPerCheck,
	);

	it(
		"claims the attempt a short id in its case",
		claimsTheAttemptAShortIdInItsCase,
	);

	it(
		"prints a record that parses with the schema that wrote it",
		printsARecordThatParsesWithTheSchemaThatWroteIt,
	);

	it(
		"writes the instant the attempt started to its record file",
		writesTheInstantTheAttemptStartedToItsRecordFile,
	);
});
