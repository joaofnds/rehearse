import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { FAIL, PASS } from "#benchmark/comparison-test-fixtures";
import { CASE_ID, nothingRunning } from "#benchmark/run-records-test-support";
import {
	recordVersionedPipelineGroup,
	recordVersionedPipelineRun,
} from "#server/case-runs-record-test-fixture";
import {
	clearCaseRunRoot,
	fixture,
	prepareCaseRunRoot,
	root,
} from "#server/case-runs-test-fixture";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";

import readCaseRuns from "./case-runs";

beforeEach(prepareCaseRunRoot);

afterEach(clearCaseRunRoot);

const OLDER_RUN = "2026-09-02T00-00-00.000Z";

const NEWER_RUN = "2026-09-03T00-00-00.000Z";

async function verifyReadCaseRunsReadsAPipelineCaseSRunsNewestFirstWithTheirVerdictsAndWholeCosts(): Promise<void> {
	await fixture.pipeline.writeFinishedRunEvidence(OLDER_RUN);
	await fixture.pipeline.writeFailedVerdictRun(NEWER_RUN);

	const { cases } = await readCaseRuns(root, nothingRunning);

	expect(cases.get(CASE_ID)?.runs).toEqual([
		{ corpusDigest: undefined, costUsd: 1.75, passed: false },
		{ corpusDigest: undefined, costUsd: 7.75, passed: true },
	]);
}

async function verifyReadCaseRunsReadsTheMinimumGradeTheNewestPipelineRunRecorded(): Promise<void> {
	await fixture.pipeline.writeFinishedRunEvidence(OLDER_RUN);
	await fixture.pipeline.writeFinishedRunEvidence(NEWER_RUN);
	await fixture.pipeline.gradeBuildBelowRaisedMinimum(NEWER_RUN);

	const { cases } = await readCaseRuns(root, nothingRunning);

	expect(cases.get(CASE_ID)?.minimumGrade).toEqual({
		letter: "A",
		state: "available",
	});
}

async function verifyReadCaseRunsReadsTheCorpusVersionAPipelineRunSManifestAndAGroupSInputsRecorded(): Promise<void> {
	const runDigest = "a".repeat(SHA256_HEX_DIGITS);
	const groupDigest = "b".repeat(SHA256_HEX_DIGITS);
	await recordVersionedPipelineRun(OLDER_RUN, runDigest);
	await recordVersionedPipelineGroup("group-p", groupDigest);

	const { cases } = await readCaseRuns(root, nothingRunning);

	expect(
		cases.get(CASE_ID)?.runs.map(({ corpusDigest }) => corpusDigest),
	).toEqual([runDigest, groupDigest, groupDigest]);
}

async function verifyReadCaseRunsCountsEachRepOfAPipelineGroupAfterTheCaseSRuns(): Promise<void> {
	await fixture.pipeline.writeFinishedRunEvidence(OLDER_RUN);
	await fixture.confirmations.records.writePipelineGroup("group-p", [
		PASS,
		FAIL,
		undefined,
	]);

	const { cases } = await readCaseRuns(root, nothingRunning);

	expect(cases.get(CASE_ID)?.runs).toEqual([
		{ corpusDigest: undefined, costUsd: 7.75, passed: true },
		{ corpusDigest: undefined, costUsd: 1, passed: true },
		{ corpusDigest: undefined, costUsd: 2, passed: false },
		{ corpusDigest: undefined, costUsd: undefined, passed: undefined },
	]);
}

describe(readCaseRuns.name, () => {
	it(
		"reads a pipeline case's runs newest first with their verdicts and whole costs",
		verifyReadCaseRunsReadsAPipelineCaseSRunsNewestFirstWithTheirVerdictsAndWholeCosts,
	);
	it(
		"reads the minimum grade the newest pipeline run recorded",
		verifyReadCaseRunsReadsTheMinimumGradeTheNewestPipelineRunRecorded,
	);
	it(
		"reads the corpus version a pipeline run's manifest and a group's inputs recorded",
		verifyReadCaseRunsReadsTheCorpusVersionAPipelineRunSManifestAndAGroupSInputsRecorded,
	);
	it(
		"counts each rep of a pipeline group after the case's runs",
		verifyReadCaseRunsCountsEachRepOfAPipelineGroupAfterTheCaseSRuns,
	);
});
