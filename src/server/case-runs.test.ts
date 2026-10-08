import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { FAIL, PASS } from "#benchmark/comparison-test-fixtures";
import {
	confirmationGroupRecordSchema,
	parseConfirmationRepRecord,
} from "#benchmark/confirmation-record";
import type { ParsedConfirmationRepRecord } from "#benchmark/confirmation-record";
import type { Immutable } from "#benchmark/contracts";
import {
	benchmarkRunPaths,
	confirmationGroupPaths,
} from "#benchmark/run-layout";
import { parseSessionAttemptRecord } from "#benchmark/session-record";
import {
	CASE_ID,
	nothingRunning,
	RecordedRunsFixture,
} from "#benchmark/run-records-test-support";
import { readCaseRuns } from "./case-runs";

const OLDER_RUN = "2026-09-02T00-00-00.000Z";
const NEWER_RUN = "2026-09-03T00-00-00.000Z";
const SESSION_CASE = "smoke";

let root: string;
let fixture: RecordedRunsFixture;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "rehearse-case-runs-"));
	fixture = new RecordedRunsFixture(root);
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

async function mergeJson(
	file: string,
	changes: Immutable<{ corpusVersion?: unknown; startedAt?: string }>,
): Promise<void> {
	const record = z
		.object({})
		.loose()
		.parse(JSON.parse(await Bun.file(file).text()));
	await Bun.write(file, JSON.stringify({ ...record, ...changes }));
}

async function rewriteRep(
	file: string,
	changes: Immutable<Partial<ParsedConfirmationRepRecord>>,
): Promise<void> {
	const record = parseConfirmationRepRecord(await Bun.file(file).text());
	await Bun.write(file, JSON.stringify({ ...record, ...changes }));
}

describe("readCaseRuns", () => {
	it("reads a pipeline case's runs newest first with their verdicts and whole costs", async () => {
		await fixture.writeFinishedRunEvidence(OLDER_RUN);
		await fixture.writeFailedVerdictRun(NEWER_RUN);

		const { cases } = await readCaseRuns(root, nothingRunning);

		expect(cases.get(CASE_ID)?.runs).toEqual([
			{ corpusDigest: undefined, passed: false, costUsd: 1.75 },
			{ corpusDigest: undefined, passed: true, costUsd: 7.75 },
		]);
	});

	it("reads the minimum grade the newest pipeline run recorded", async () => {
		await fixture.writeFinishedRunEvidence(OLDER_RUN);
		await fixture.writeFinishedRunEvidence(NEWER_RUN);
		await fixture.gradeBuildBelowRaisedMinimum(NEWER_RUN);

		const { cases } = await readCaseRuns(root, nothingRunning);

		expect(cases.get(CASE_ID)?.minimumGrade).toEqual({
			state: "available",
			letter: "A",
		});
	});

	it("reads the corpus version a pipeline run's manifest and a group's inputs recorded", async () => {
		const runDigest = "a".repeat(64);
		const groupDigest = "b".repeat(64);
		await fixture.writeFinishedRunEvidence(OLDER_RUN);
		await mergeJson(benchmarkRunPaths(root, OLDER_RUN).manifestFile, {
			corpusVersion: { kind: "version", digest: runDigest },
		});
		await fixture.writePipelineGroup("group-p", [PASS, PASS]);
		const { groupFile } = confirmationGroupPaths(root, "group-p");
		const group = confirmationGroupRecordSchema.parse(
			JSON.parse(await Bun.file(groupFile).text()),
		);
		await Bun.write(
			groupFile,
			JSON.stringify({
				...group,
				inputs: {
					...group.inputs,
					corpusVersion: { kind: "version", digest: groupDigest },
				},
			}),
		);

		const { cases } = await readCaseRuns(root, nothingRunning);

		expect(
			cases.get(CASE_ID)?.runs.map(({ corpusDigest }) => corpusDigest),
		).toEqual([runDigest, groupDigest, groupDigest]);
	});

	it("places a group that recorded its start time among the case's runs by it", async () => {
		const runDigest = "a".repeat(64);
		const groupDigest = "b".repeat(64);
		await fixture.writeFinishedRunEvidence(OLDER_RUN);
		await mergeJson(benchmarkRunPaths(root, OLDER_RUN).manifestFile, {
			corpusVersion: { kind: "version", digest: runDigest },
		});
		await fixture.writePipelineGroup("group-p", [PASS, PASS]);
		const { groupFile } = confirmationGroupPaths(root, "group-p");
		const group = confirmationGroupRecordSchema.parse(
			JSON.parse(await Bun.file(groupFile).text()),
		);
		await Bun.write(
			groupFile,
			JSON.stringify({
				...group,
				inputs: {
					...group.inputs,
					corpusVersion: { kind: "version", digest: groupDigest },
				},
				startedAt: "2026-09-02T00:30:00.000Z",
			}),
		);

		const { cases } = await readCaseRuns(root, nothingRunning);

		expect(
			cases.get(CASE_ID)?.runs.map(({ corpusDigest }) => corpusDigest),
		).toEqual([groupDigest, groupDigest, runDigest]);
	});

	it("places a session group that recorded its start time before an older attempt", async () => {
		const attemptDigest = "d".repeat(64);
		const attemptFile = await fixture.writeAttemptAt(
			"0f6b6f2a-0000-4000-8000-00000000000a",
			join(import.meta.dir, "..", ".."),
			SESSION_CASE,
			[],
			{ kind: "version", digest: attemptDigest },
		);
		const attempt = parseSessionAttemptRecord(
			await Bun.file(attemptFile).text(),
		);
		await Bun.write(
			attemptFile,
			JSON.stringify({
				...attempt,
				schemaVersion: 3,
				startedAt: "2026-09-02T00:15:00.000Z",
			}),
		);
		await fixture.writeSessionGroup("group-s");
		await mergeJson(confirmationGroupPaths(root, "group-s").groupFile, {
			startedAt: "2026-09-02T00:30:00.000Z",
		});

		const { cases } = await readCaseRuns(root, nothingRunning);

		expect(
			cases
				.get(SESSION_CASE)
				?.runs.map(({ corpusDigest }) => corpusDigest)
				.at(-1),
		).toBe(attemptDigest);
	});

	it("counts each rep of a pipeline group after the case's runs", async () => {
		await fixture.writeFinishedRunEvidence(OLDER_RUN);
		await fixture.writePipelineGroup("group-p", [PASS, FAIL, undefined]);

		const { cases } = await readCaseRuns(root, nothingRunning);

		expect(cases.get(CASE_ID)?.runs).toEqual([
			{ corpusDigest: undefined, passed: true, costUsd: 7.75 },
			{ corpusDigest: undefined, passed: true, costUsd: 1 },
			{ corpusDigest: undefined, passed: false, costUsd: 2 },
			{ corpusDigest: undefined, passed: undefined, costUsd: undefined },
		]);
	});

	it("reads session attempts and session group reps for a session case", async () => {
		const digest = "d".repeat(64);
		await fixture.writeAttemptAt(
			"0f6b6f2a-0000-4000-8000-00000000000a",
			join(import.meta.dir, "..", ".."),
			SESSION_CASE,
			[],
			{ kind: "version", digest },
		);
		await fixture.writeSessionGroup("group-s");

		const { cases } = await readCaseRuns(root, nothingRunning);

		expect(cases.get(SESSION_CASE)).toEqual({
			runs: [
				{ corpusDigest: digest, passed: true, costUsd: 0.5 },
				{ corpusDigest: undefined, passed: undefined, costUsd: undefined },
				{ corpusDigest: undefined, passed: undefined, costUsd: undefined },
			],
			minimumGrade: undefined,
		});
	});

	it.each([
		{
			outcome: "UNSUCCESSFUL",
			changes: {
				outcome: "UNSUCCESSFUL",
				checks: [{ kind: "word-band", status: "FAIL", detail: "too long" }],
			},
			passed: false,
		},
		{
			outcome: "NO_REPLY",
			changes: { outcome: "NO_REPLY", reply: undefined, checks: [] },
			passed: undefined,
		},
	])(
		"reads a session attempt recorded $outcome as passed $passed",
		async ({ changes, passed }) => {
			const file = await fixture.writeAttemptAt(
				"0f6b6f2a-0000-4000-8000-00000000000b",
				join(import.meta.dir, "..", ".."),
				SESSION_CASE,
				[],
			);
			const record = parseSessionAttemptRecord(await Bun.file(file).text());
			await Bun.write(file, JSON.stringify({ ...record, ...changes }));

			const { cases, unreadable } = await readCaseRuns(root, nothingRunning);

			expect(unreadable).toEqual([]);
			expect(cases.get(SESSION_CASE)?.runs).toEqual([
				{ corpusDigest: undefined, passed, costUsd: 0.5 },
			]);
		},
	);

	it("reads a session rep whose checks ran by its outcome, taking it from its attempt when its metrics went missing", async () => {
		const [checked, unmeasured] = await fixture.writeSessionGroup("group-s", 2);
		const paths = confirmationGroupPaths(root, "group-s");
		await rewriteRep(paths.rep(checked).recordFile, {
			outcome: "UNSUCCESSFUL",
			stages: [
				{
					stage: "checks",
					status: "JUDGED",
					grade: "F",
					verdict: "STOP",
					elapsedMs: 1,
					evidence: { recordFile: "attempt.json" },
				},
			],
		});
		await rewriteRep(paths.rep(unmeasured).recordFile, {
			outcome: "UNSUCCESSFUL",
			stages: [
				{
					stage: "checks",
					status: "METRICS_MISSING",
					elapsedMs: 1,
					error: "Worker call metrics are missing",
					evidence: { recordFile: "attempt.json" },
				},
			],
		});

		const { cases } = await readCaseRuns(root, nothingRunning);

		expect(cases.get(SESSION_CASE)?.runs.map(({ passed }) => passed)).toEqual([
			false,
			true,
		]);
	});

	it("reports a rep record it cannot read and still counts the rep", async () => {
		const [rep] = await fixture.writeSessionGroup("group-s");
		await Bun.write(
			confirmationGroupPaths(root, "group-s").rep(rep).recordFile,
			"{ not json",
		);

		const { cases, unreadable } = await readCaseRuns(root, nothingRunning);

		expect(cases.get(SESSION_CASE)?.runs).toHaveLength(2);
		expect(unreadable.map(({ id }) => id)).toEqual([`group-s/${rep}`]);
	});

	it("leaves stage-mode groups and stage replays out of every case", async () => {
		await fixture.writeStageGroupWithReps("group-st");
		await fixture.writeReplayOf(OLDER_RUN, NEWER_RUN);

		const { cases } = await readCaseRuns(root, nothingRunning);

		expect([...cases.keys()]).toEqual([]);
	});

	it("reports a record it cannot read and reads the rest", async () => {
		await fixture.writeFinishedRunEvidence(OLDER_RUN);
		await fixture.writeUnreadableGroup("group-x");

		const { cases, unreadable } = await readCaseRuns(root, nothingRunning);

		expect(cases.get(CASE_ID)?.runs).toHaveLength(1);
		expect(unreadable.map(({ id }) => id)).toEqual(["group-x"]);
	});
});
