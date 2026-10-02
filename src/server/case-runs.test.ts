import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FAIL, PASS } from "#benchmark/comparison-test-fixtures";
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
