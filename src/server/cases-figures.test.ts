import { afterEach, describe, expect, it } from "bun:test";
import { join } from "node:path";

import { PASS } from "#benchmark/comparison-test-fixtures";
import { CASE_ID } from "#benchmark/run-records-test-support";
import { clearCaseRoots, serving } from "#server/cases-test-fixture";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";

afterEach(clearCaseRoots);

const OLDER_RUN = "2026-09-02T00-00-00.000Z";

const NEWER_RUN = "2026-09-03T00-00-00.000Z";

const SESSION_CASE_ID = "smoke";

const digest = "d".repeat(SHA256_HEX_DIGITS);

const EXPECTED_SESSION_COHORTS = {
	cohorts: [
		{
			corpusVersion: digest,
			figures: { counted: 1, judged: 1, leftOut: 0, passed: 1 },
			members: [
				{
					href: `/attempts/session/${SESSION_CASE_ID}/0f6b6f2a-0000-4000-8000-00000000000a`,
					run: { corpusDigest: digest, costUsd: 0.5, passed: true },
				},
			],
		},
		{
			corpusVersion: null,
			figures: {
				costPerRun: { lacking: 2, meanUsd: null },
				counted: 2,
				judged: 0,
				passed: 0,
			},
			members: [
				{ href: "/groups/group-s/reps/group-s-rep-1/attempt" },
				{ href: "/groups/group-s/reps/group-s-rep-2/attempt" },
			],
		},
	],
};

describe("GET /api/cases", () => {
	it(
		"reads a pipeline case's median verdict, cost per run and latest minimum grade over its runs and group reps",
		verifyReadsAPipelineCaseSMedianVerdictCostPer,
	);
	describe(
		"when the latest run recorded no minimum grade",
		registerCasesFiguresWhenTheLatestRunRecordedNoMinimumGrade,
	);
	describe(
		"when only a group ran a pipeline case",
		registerCasesFiguresWhenOnlyAGroupRanAPipelineCase,
	);
	it(
		"counts a session case's attempts and group reps at the latest corpus version, with no letter",
		verifyCountsASessionCaseSAttemptsAndGroupReps,
	);
});

async function verifyReadsAPipelineCaseSMedianVerdictCostPer(): Promise<void> {
	const { fixture, listed } = await serving();
	await fixture.pipeline.writeFailedVerdictRun(OLDER_RUN);
	await fixture.pipeline.writeFinishedRunEvidence(NEWER_RUN);
	await fixture.pipeline.gradeBuildBelowRaisedMinimum(NEWER_RUN);
	await fixture.confirmations.records.writePipelineGroup("group-p", [
		PASS,
		undefined,
	]);

	expect(await listed(CASE_ID)).toMatchObject({
		figures: {
			corpusVersion: null,
			costPerRun: { costed: 3, lacking: 1, meanUsd: 3.5 },
			counted: 4,
			judged: 3,
			leftOut: 0,
			median: "PASS",
			passed: 2,
			state: "measured",
		},
		latestMinimumGrade: { letter: "A", state: "recorded" },
	});
}

async function verifyReadsItAsNotRecorded(): Promise<void> {
	const { fixture, listed } = await serving();
	await fixture.pipeline.writeFinishedRunEvidence(OLDER_RUN);

	expect(await listed(CASE_ID)).toMatchObject({
		latestMinimumGrade: { state: "not-recorded" },
	});
}

async function verifyReadsItAsNotRecordedEvenWhenAnOlder(): Promise<void> {
	const { fixture, listed } = await serving();
	await fixture.pipeline.writeFinishedRunEvidence(OLDER_RUN);
	await fixture.pipeline.gradeBuildBelowRaisedMinimum(OLDER_RUN);
	await fixture.pipeline.writeFinishedRunEvidence(NEWER_RUN);

	expect(await listed(CASE_ID)).toMatchObject({
		latestMinimumGrade: { state: "not-recorded" },
	});
}

async function verifyReadsItsMinimumGradeAsNotRecordedSinceA(): Promise<void> {
	const { fixture, listed } = await serving();
	await fixture.confirmations.records.writePipelineGroup("group-p", [
		PASS,
		PASS,
	]);

	expect(await listed(CASE_ID)).toMatchObject({
		latestMinimumGrade: { state: "not-recorded" },
	});
}

async function verifyCountsASessionCaseSAttemptsAndGroupReps(): Promise<void> {
	const { fixture, listed } = await serving();
	await fixture.sessions.writeAttemptAt(
		"0f6b6f2a-0000-4000-8000-00000000000a",
		{
			caseId: SESSION_CASE_ID,
			corpusRoot: join(import.meta.dir, "..", ".."),
			corpusVersion: { digest, kind: "version" },
			layoutPaths: [],
		},
	);
	await fixture.confirmations.records.writeSessionGroup("group-s");

	expect(await listed(SESSION_CASE_ID)).toMatchObject({
		figures: {
			corpusVersion: digest,
			costPerRun: { costed: 1, lacking: 0, meanUsd: 0.5 },
			counted: 1,
			judged: 1,
			leftOut: 2,
			passed: 1,
			state: "measured",
		},
	});
	expect(await listed(SESSION_CASE_ID)).not.toHaveProperty("figures.median");
	expect(await listed(SESSION_CASE_ID)).toMatchObject(EXPECTED_SESSION_COHORTS);
}

function registerCasesFiguresWhenTheLatestRunRecordedNoMinimumGrade(): void {
	it("reads it as not recorded", verifyReadsItAsNotRecorded);

	it(
		"reads it as not recorded even when an older run recorded one",
		verifyReadsItAsNotRecordedEvenWhenAnOlder,
	);
}

function registerCasesFiguresWhenOnlyAGroupRanAPipelineCase(): void {
	it(
		"reads its minimum grade as not recorded, since a group records none",
		verifyReadsItsMinimumGradeAsNotRecordedSinceA,
	);
}
