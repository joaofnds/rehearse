import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { confirmationGroupPaths } from "#benchmark/run-layout";
import { RecordedRunsFixture } from "#benchmark/run-records-test-support";

import expectHistoryError from "./evidence-test-support";
import readGroupFinalAssessment from "./group-final-assessment";

const RESOURCE_DRAIN_START_INDEX = 0;

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(
		roots.splice(RESOURCE_DRAIN_START_INDEX).map(async (root) => {
			await rm(root, { force: true, recursive: true });
		}),
	);
});

async function fixture(recordsName?: string): Promise<{
	readonly runsDirectory: string;
	readonly groupId: string;
	readonly repId: string;
	readonly finalFile: string;
}> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-group-final-"));
	roots.push(root);
	const runsDirectory =
		recordsName === undefined ? root : join(root, recordsName);
	await mkdir(runsDirectory, { recursive: true });
	const records = new RecordedRunsFixture(runsDirectory);
	const groupId = "group-final";
	await records.confirmations.records.writePipelineGroup(groupId, [
		{ build: "pass", discussion: "pass", final: "fail" },
		{ build: "pass", discussion: "pass", final: "pass" },
	]);
	const repId = `${groupId}-rep-1`;
	return {
		finalFile: confirmationGroupPaths(runsDirectory, groupId).rep(repId)
			.finalFile,
		groupId,
		repId,
		runsDirectory,
	};
}

const finalRecord = {
	grade: {
		requirements: [
			{
				evidence: [
					{
						claim: "hasMore is absent.",
						locator: {
							endLine: 12,
							file: "src/a.ts",
							kind: "lines",
							occurrences: 1,
							startLine: 12,
						},
						path: "src/a.ts",
						quote: "return {items: []}",
						source: "diff",
					},
				],
				id: "response-contract",
				status: "FAIL",
			},
		],
		summary: "The response omitted hasMore.",
		verdict: "FAIL",
	},
};

describe(readGroupFinalAssessment.name, () => {
	it(
		"reads independently judged requirements with retained quotes and source locations",
		verifyReadGroupFinalAssessmentNameReadsIndependentlyJudgedRequirementsWithRetainedQuotesAndSourceLocations,
	);

	it(
		"labels older verdict-only records as missing evidence",
		verifyReadGroupFinalAssessmentNameLabelsOlderVerdictOnlyRecordsAsMissingEvidence,
	);

	it(
		"does not borrow an assessment with a different verdict",
		verifyReadGroupFinalAssessmentNameDoesNotBorrowAnAssessmentWithADifferentVerdict,
	);

	it(
		"handles malformed final JSON without substituting a failed grade",
		verifyReadGroupFinalAssessmentNameHandlesMalformedFinalJSONWithoutSubstitutingAFailedGrade,
	);

	it(
		"refuses an evidence symlink even inside the records directory",
		verifyReadGroupFinalAssessmentNameRefusesAnEvidenceSymlinkEvenInsideTheRecordsDirectory,
	);

	it(
		"reads an owned final assessment under a records directory named confirmations",
		verifyReadGroupFinalAssessmentNameReadsAnOwnedFinalAssessmentUnderARecordsDirectoryNamedConfirmations,
	);
});

async function verifyReadGroupFinalAssessmentNameReadsIndependentlyJudgedRequirementsWithRetainedQuotesAndSourceLocations(): Promise<void> {
	const saved = await fixture();
	await Bun.write(saved.finalFile, JSON.stringify(finalRecord));

	const result = await readGroupFinalAssessment(saved);

	expect(result).toEqual({
		requirements: [
			{
				evidence: [
					{
						claim: "hasMore is absent.",
						path: "src/a.ts",
						place: "src/a.ts:12",
						quote: "return {items: []}",
						source: "diff",
					},
				],
				id: "response-contract",
				status: "FAIL",
			},
		],
		state: "available",
		summary: finalRecord.grade.summary,
	});
}

async function verifyReadGroupFinalAssessmentNameLabelsOlderVerdictOnlyRecordsAsMissingEvidence(): Promise<void> {
	const saved = await fixture();

	const result = await readGroupFinalAssessment(saved);

	expect(result).toEqual({
		reason:
			"This older repetition retains the final verdict only; detailed rationale was not saved.",
		state: "unavailable",
	});
}

async function verifyReadGroupFinalAssessmentNameDoesNotBorrowAnAssessmentWithADifferentVerdict(): Promise<void> {
	const saved = await fixture();
	await Bun.write(
		saved.finalFile,
		JSON.stringify({
			...finalRecord,
			grade: { ...finalRecord.grade, verdict: "PASS" },
		}),
	);

	const result = await readGroupFinalAssessment(saved);

	expect(result).toMatchObject({
		state: "unavailable",
	});
}

async function verifyReadGroupFinalAssessmentNameHandlesMalformedFinalJSONWithoutSubstitutingAFailedGrade(): Promise<void> {
	const saved = await fixture();
	await Bun.write(saved.finalFile, "{broken");

	const result = await readGroupFinalAssessment(saved);

	expect(result).toEqual({
		reason: "The saved final assessment is not readable JSON.",
		state: "unavailable",
	});
}

async function verifyReadGroupFinalAssessmentNameRefusesAnEvidenceSymlinkEvenInsideTheRecordsDirectory(): Promise<void> {
	const saved = await fixture();
	const other = join(saved.runsDirectory, "other.json");
	await Bun.write(other, JSON.stringify(finalRecord));
	await symlink(other, saved.finalFile);

	await expectHistoryError(readGroupFinalAssessment(saved), "refused");

	await unlink(saved.finalFile);
}

async function verifyReadGroupFinalAssessmentNameReadsAnOwnedFinalAssessmentUnderARecordsDirectoryNamedConfirmations(): Promise<void> {
	const saved = await fixture("confirmations");
	await Bun.write(saved.finalFile, JSON.stringify(finalRecord));

	const result = await readGroupFinalAssessment(saved);

	expect(result).toMatchObject({
		state: "available",
		summary: finalRecord.grade.summary,
	});
}
