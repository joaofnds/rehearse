import { afterEach, describe, expect, it } from "bun:test";

import { failureOf } from "#cli/cli-test-support";
import { CalibrationRefusalError } from "#server/calibration-contract";
import {
	clearHistoryRoots,
	writtenHistoryGroup,
} from "#server/history-workspace-test-fixture";
import SavedSessionRecordBuilder from "#server/saved-session-record-test-builder";
import { SessionHistoryReaderError } from "#server/session-history-reader";
import {
	REVIEW_TIME,
	clearReviewRoots,
	judgedAttempt,
	reviewFor,
	unavailableJudgedAttempt,
} from "#server/session-review-test-fixture";

import { readSessionReview, recordSessionReview } from "./session-review";

const SINGLE_REP_COUNT = 1;
const STRING_START_INDEX = 0;
const INVALID_UTF8_BYTE = 255;
afterEach(clearReviewRoots);
afterEach(clearHistoryRoots);

describe(readSessionReview.name, () => {
	it(
		"refuses malformed UTF-8 rather than binding two different byte strings to one review",
		refusesInvalidUtf8,
	);
	it(
		"records a human rubric review even when the Judge has no grade",
		reviewsUnavailableJudge,
	);
	it(
		"reports agreement when both verdicts and requirements match",
		reportsMatchingGrades,
	);
	it(
		"refuses a confirmation attempt whose saved lineage names another rep",
		refusesMismatchedLineage,
	);
	it(
		"refuses copied review metadata rather than reporting agreement for another Judge",
		refusesMismatchedJudgeIdentity,
	);
});
async function reviewsUnavailableJudge(): Promise<void> {
	const fixture = await unavailableJudgedAttempt();
	const reading = await recordSessionReview(
		{ id: fixture.id, runsDirectory: fixture.root },
		await reviewFor(fixture),
		REVIEW_TIME,
	);
	expect(reading.review?.requirements).toEqual([
		{ id: "accuracy", status: "FAIL" },
	]);
	expect(reading.agreement).toBeUndefined();
}
async function reportsMatchingGrades(): Promise<void> {
	const fixture = await judgedAttempt();
	const review = await reviewFor(fixture);
	const reading = await recordSessionReview(
		{ id: fixture.id, runsDirectory: fixture.root },
		{
			...review,
			requirements: [{ id: "accuracy", status: "PASS" }],
			verdict: "PASS",
		},
		REVIEW_TIME,
	);
	expect(reading.agreement).toEqual({ differences: [], verdict: true });
}
async function refusesMismatchedLineage(): Promise<void> {
	const {
		fixture,
		paths,
		reps: [repId],
	} = await writtenHistoryGroup("review-group", SINGLE_REP_COUNT);
	await Bun.write(
		paths.rep(repId).attemptFile,
		JSON.stringify(
			new SavedSessionRecordBuilder({
				caseId: fixture.sessionAttempt.caseId,
				lineage: "another-lineage",
			}).build(),
		),
	);
	const error = await failureOf(
		readSessionReview({
			id: `rep:session:review-group/${repId}`,
			runsDirectory: fixture.runsDirectory,
		}),
	);
	expect(error).toBeInstanceOf(SessionHistoryReaderError);
}
async function refusesMismatchedJudgeIdentity(): Promise<void> {
	const fixture = await judgedAttempt();
	const reading = await recordSessionReview(
		{ id: fixture.id, runsDirectory: fixture.root },
		await reviewFor(fixture),
		REVIEW_TIME,
	);
	await Bun.write(
		`${fixture.paths.recordFile}.review.json`,
		JSON.stringify({
			...reading.review,
			judge: { ...reading.review?.judge, model: "another-model" },
		}),
	);
	const error = await failureOf(
		readSessionReview({ id: fixture.id, runsDirectory: fixture.root }),
	);
	expect(error).toBeInstanceOf(CalibrationRefusalError);
}

async function refusesInvalidUtf8(): Promise<void> {
	const fixture = await judgedAttempt();
	const text = await Bun.file(fixture.paths.recordFile).text();
	const prefix = text.indexOf('"reply":"done"');
	const raw = Buffer.concat([
		Buffer.from(text.slice(STRING_START_INDEX, prefix)),
		Buffer.from('"reply":"'),
		Buffer.from([INVALID_UTF8_BYTE]),
		Buffer.from('"'),
		Buffer.from(text.slice(prefix + '"reply":"done"'.length)),
	]);
	await Bun.write(fixture.paths.recordFile, raw);
	const error = await failureOf(
		readSessionReview({ id: fixture.id, runsDirectory: fixture.root }),
	);
	expect(error).toBeInstanceOf(SessionHistoryReaderError);
}
