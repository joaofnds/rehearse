import { afterEach, describe, expect, it } from "bun:test";
import { symlink } from "node:fs/promises";

import { InvalidSessionReviewError } from "#benchmark/session-review";
import { failureOf } from "#cli/cli-test-support";
import { CalibrationRefusalError } from "#server/calibration-contract";
import {
	clearHistoryRoots,
	writtenHistoryGroup,
} from "#server/history-workspace-test-fixture";
import { SessionHistoryReaderError } from "#server/session-history-reader";
import {
	REVIEW_TIME,
	clearReviewRoots,
	judgedAttempt,
	reviewFor,
	savedAttempt,
} from "#server/session-review-test-fixture";

import { readSessionReview, recordSessionReview } from "./session-review";

const INVALID_GRADES = [
	{ requirements: [], verdict: "FAIL" },
	{ requirements: [{ id: "unknown", status: "FAIL" }], verdict: "FAIL" },
	{
		requirements: [
			{ id: "accuracy", status: "FAIL" },
			{ id: "accuracy", status: "FAIL" },
		],
		verdict: "FAIL",
	},
	{ requirements: [{ id: "accuracy", status: "FAIL" }], verdict: "PASS" },
] as const;

const SINGLE_REP_COUNT = 1;

afterEach(clearReviewRoots);
afterEach(clearHistoryRoots);

describe(recordSessionReview.name, () => {
	it(
		"records a person's review beside checks without changing the attempt",
		recordsReviewWithoutChangingAttempt,
	);
	it(
		"compares the human requirements with the exact saved Judge",
		comparesExactSavedJudge,
	);
	it(
		"records a confirmation rep under its owned identity",
		reviewsOwnedConfirmationRep,
	);
});

describe("when submissions conflict with saved evidence", () => {
	it.each([...INVALID_GRADES])(
		"refuses invalid requirement coverage or verdict: %j",
		refusesInvalidGrade,
	);
	it("refuses a changed source before saving a review", refusesChangedSource);
	it(
		"saves exactly one concurrent submission and preserves it on duplicate writes",
		savesOneConcurrentReview,
	);
	it(
		"withholds agreement when an already reviewed source changes",
		withholdsStaleAgreement,
	);
	it(
		"refuses a symlinked review on read and never overwrites its target",
		refusesSymlinkedReview,
	);
});

async function recordsReviewWithoutChangingAttempt(): Promise<void> {
	const fixture = await savedAttempt();
	const original = await Bun.file(fixture.paths.recordFile).text();
	const review = await reviewFor(fixture);

	await recordSessionReview(
		{ id: fixture.id, runsDirectory: fixture.root },
		review,
		REVIEW_TIME,
	);
	const reading = await readSessionReview({
		id: fixture.id,
		runsDirectory: fixture.root,
	});

	expect(reading.review).toMatchObject({
		recordedAt: REVIEW_TIME,
		sourceId: fixture.id,
		summary: review.summary,
		verdict: "FAIL",
	});
	expect(reading.stale).toBe(false);
	expect(reading.agreement).toBeUndefined();
	expect(await Bun.file(fixture.paths.recordFile).text()).toBe(original);
}

async function comparesExactSavedJudge(): Promise<void> {
	const fixture = await judgedAttempt();
	const review = await reviewFor(fixture);

	const reading = await recordSessionReview(
		{ id: fixture.id, runsDirectory: fixture.root },
		review,
		REVIEW_TIME,
	);

	expect(reading.agreement).toEqual({
		differences: [{ human: "FAIL", id: "accuracy", judge: "PASS" }],
		verdict: false,
	});
	expect(reading.review?.judge).toEqual(reading.judge);
}

async function reviewsOwnedConfirmationRep(): Promise<void> {
	const {
		fixture,
		paths,
		reps: [repId],
	} = await writtenHistoryGroup("review-group", SINGLE_REP_COUNT);
	const id = `rep:session:review-group/${repId}`;
	const original = await Bun.file(paths.rep(repId).attemptFile).text();
	const source = await readSessionReview({
		id,
		runsDirectory: fixture.runsDirectory,
	});

	const reading = await recordSessionReview(
		{ id, runsDirectory: fixture.runsDirectory },
		{
			requirements: [],
			sourceSha256: source.sourceSha256,
			summary: "Reviewed the saved rep.",
			verdict: "PASS",
		},
		REVIEW_TIME,
	);

	expect(reading.review?.sourceId).toBe(id);
	expect(await Bun.file(paths.rep(repId).attemptFile).text()).toBe(original);
}

async function refusesChangedSource(): Promise<void> {
	const fixture = await savedAttempt();
	const review = await reviewFor(fixture);
	await Bun.write(
		fixture.paths.recordFile,
		`${await Bun.file(fixture.paths.recordFile).text()}\n`,
	);

	const error = await failureOf(
		recordSessionReview(
			{ id: fixture.id, runsDirectory: fixture.root },
			review,
			REVIEW_TIME,
		),
	);
	expect(error).toBeInstanceOf(CalibrationRefusalError);
}

async function savesOneConcurrentReview(): Promise<void> {
	const fixture = await savedAttempt();
	const review = await reviewFor(fixture);
	const request = { id: fixture.id, runsDirectory: fixture.root };

	const results = await Promise.allSettled([
		recordSessionReview(request, review, REVIEW_TIME),
		recordSessionReview(request, review, REVIEW_TIME),
	]);

	expect(results.map(({ status }) => status).toSorted()).toEqual([
		"fulfilled",
		"rejected",
	]);
	const reading = await readSessionReview(request);
	expect(reading.review?.summary).toBe(review.summary);
}

async function withholdsStaleAgreement(): Promise<void> {
	const fixture = await judgedAttempt();
	await recordSessionReview(
		{ id: fixture.id, runsDirectory: fixture.root },
		await reviewFor(fixture),
		REVIEW_TIME,
	);
	await Bun.write(
		fixture.paths.recordFile,
		`${await Bun.file(fixture.paths.recordFile).text()}\n`,
	);

	const reading = await readSessionReview({
		id: fixture.id,
		runsDirectory: fixture.root,
	});

	expect(reading.stale).toBe(true);
	expect(reading.agreement).toBeUndefined();
}

async function refusesSymlinkedReview(): Promise<void> {
	const fixture = await savedAttempt();
	const review = await reviewFor(fixture);
	const target = `${fixture.paths.recordFile}.target`;
	await Bun.write(target, "private");
	await symlink(target, `${fixture.paths.recordFile}.review.json`);

	const error = await failureOf(
		readSessionReview({ id: fixture.id, runsDirectory: fixture.root }),
	);
	expect(error).toBeInstanceOf(SessionHistoryReaderError);
	const writeError = await failureOf(
		recordSessionReview(
			{ id: fixture.id, runsDirectory: fixture.root },
			review,
			REVIEW_TIME,
		),
	);
	expect(writeError).toBeInstanceOf(CalibrationRefusalError);
	expect(await Bun.file(target).text()).toBe("private");
}

async function refusesInvalidGrade(
	override: (typeof INVALID_GRADES)[number],
): Promise<void> {
	const fixture = await judgedAttempt();
	const review = await reviewFor(fixture);

	const error = await failureOf(
		recordSessionReview(
			{ id: fixture.id, runsDirectory: fixture.root },
			{ ...review, ...override },
			REVIEW_TIME,
		),
	);
	expect(error).toBeInstanceOf(InvalidSessionReviewError);

	const reading = await readSessionReview({
		id: fixture.id,
		runsDirectory: fixture.root,
	});
	expect(reading.review).toBeUndefined();
}
