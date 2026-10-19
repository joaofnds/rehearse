import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "node:path";

import type { JsonValue } from "#benchmark/json-value";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import { nothingRunning } from "#benchmark/run-records-test-support";
import { parseSessionAttemptRecord } from "#benchmark/session-record";
import {
	attemptRun,
	digest,
	firstGroupRun,
	missingRun,
	rewriteRep,
} from "#server/case-runs-record-test-fixture";
import {
	clearCaseRunRoot,
	fixture,
	prepareCaseRunRoot,
	root,
} from "#server/case-runs-test-fixture";

import readCaseRuns from "./case-runs";

const PAIRED_SESSION_REP_COUNT = 2;

const SESSION_CASE = "smoke";

beforeEach(prepareCaseRunRoot);

afterEach(clearCaseRunRoot);

async function verifyReadCaseRunsReadsSessionAttemptsAndSessionGroupRepsForASessionCase(): Promise<void> {
	await fixture.sessions.writeAttemptAt(
		"0f6b6f2a-0000-4000-8000-00000000000a",
		{
			caseId: SESSION_CASE,
			corpusRoot: join(import.meta.dir, "..", ".."),
			corpusVersion: { digest, kind: "version" },
			layoutPaths: [],
		},
	);
	await fixture.confirmations.records.writeSessionGroup("group-s");

	const { cases } = await readCaseRuns(root, nothingRunning);
	expect(cases.get(SESSION_CASE)).toEqual({
		members: [
			{
				href: `/attempts/session/${SESSION_CASE}/0f6b6f2a-0000-4000-8000-00000000000a`,
				label: "Session 0f6b6f2a",
				run: attemptRun,
				startedAt: null,
			},
			{
				href: "/groups/group-s/reps/group-s-rep-1/attempt",
				label: "group-s · group-s-rep-1",
				run: firstGroupRun,
				startedAt: null,
			},
			{
				href: "/groups/group-s/reps/group-s-rep-2/attempt",
				label: "group-s · group-s-rep-2",
				run: missingRun,
				startedAt: null,
			},
		],
		minimumGrade: undefined,
		runs: [attemptRun, firstGroupRun, missingRun],
	});
}

async function verifyReadCaseRunsReadsASessionRepWhoseChecksRanByItsOutcomeTakingItFromItsAttemptWhenItsMetricsWentMissing(): Promise<void> {
	const [checked, unmeasured] =
		await fixture.confirmations.records.writeSessionGroup(
			"group-s",
			PAIRED_SESSION_REP_COUNT,
		);
	const paths = confirmationGroupPaths(root, "group-s");
	await rewriteRep(paths.rep(checked).recordFile, {
		outcome: "UNSUCCESSFUL",
		stages: [
			{
				elapsedMs: 1,
				evidence: { recordFile: "attempt.json" },
				grade: "F",
				stage: "checks",
				status: "JUDGED",
				verdict: "STOP",
			},
		],
	});
	await rewriteRep(paths.rep(unmeasured).recordFile, {
		outcome: "UNSUCCESSFUL",
		stages: [
			{
				elapsedMs: 1,
				error: "Worker call metrics are missing",
				evidence: { recordFile: "attempt.json" },
				stage: "checks",
				status: "METRICS_MISSING",
			},
		],
	});

	const { cases } = await readCaseRuns(root, nothingRunning);

	expect(cases.get(SESSION_CASE)?.runs.map(({ passed }) => passed)).toEqual([
		false,
		true,
	]);
}

describe(readCaseRuns.name, () => {
	it(
		"reads session attempts and session group reps for a session case",
		verifyReadCaseRunsReadsSessionAttemptsAndSessionGroupRepsForASessionCase,
	);
	it.each([
		{
			assessment: {
				recordedOutcome: "UNSUCCESSFUL",
				replyChecks: { passed: 0, total: 1 },
			},
			changes: {
				checks: [{ detail: "too long", kind: "word-band", status: "FAIL" }],
				outcome: "UNSUCCESSFUL",
			},
			outcome: "UNSUCCESSFUL",
			passed: false,
		},
		{
			assessment: { recordedOutcome: "NO_REPLY" },
			changes: { checks: [], outcome: "NO_REPLY", reply: undefined },
			outcome: "NO_REPLY",
			passed: undefined,
		},
	])(
		"reads a session attempt recorded $outcome as passed $passed",
		verifyRecordedSessionOutcome,
	);
	it(
		"reads a session rep whose checks ran by its outcome, taking it from its attempt when its metrics went missing",
		verifyReadCaseRunsReadsASessionRepWhoseChecksRanByItsOutcomeTakingItFromItsAttemptWhenItsMetricsWentMissing,
	);
});

async function verifyRecordedSessionOutcome({
	changes,
	passed,
	assessment,
}: Readonly<{
	changes: Readonly<Record<string, JsonValue | undefined>>;
	passed: boolean | undefined;
	assessment: Readonly<Record<string, JsonValue | undefined>>;
}>): Promise<void> {
	const file = await fixture.sessions.writeAttemptAt(
		"0f6b6f2a-0000-4000-8000-00000000000b",
		{
			caseId: SESSION_CASE,
			corpusRoot: join(import.meta.dir, "..", ".."),
			layoutPaths: [],
		},
	);
	const record = parseSessionAttemptRecord(await Bun.file(file).text());
	await Bun.write(file, JSON.stringify({ ...record, ...changes }));

	const { cases, unreadable } = await readCaseRuns(root, nothingRunning);

	expect(unreadable).toEqual([]);
	expect(cases.get(SESSION_CASE)?.runs).toEqual([
		{
			corpusDigest: undefined,
			costUsd: 0.5,
			passed,
			...assessment,
			savedState: {
				reason:
					"No saved state assessment was recorded; declaration is unknown.",
				state: "unavailable",
			},
		},
	]);
}
