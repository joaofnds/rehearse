import { afterEach, describe, expect, it } from "bun:test";

import { failureOf, recordOutput } from "#cli/cli-test-support";
import { UsageError } from "#cli/commands";
import runReview from "#cli/review-command";
import ReviewRequestBuilder from "#cli/review-request-test-builder";
import {
	clearReviewRoots,
	reviewFor,
	savedAttempt,
} from "#server/session-review-test-fixture";

const FIRST_OUTPUT = 0;
afterEach(clearReviewRoots);

describe(runReview.name, () => {
	it(
		"escapes persisted control and bidi characters at the terminal while preserving JSON values",
		escapesReviewText,
	);
	it("prints a readable context unless JSON is requested", readsHumanContext);
	it(
		"writes and reads the same session review through the CLI",
		writesAndReadsTheSameSessionReviewThroughTheCli,
	);
	it(
		"records a review JSON file bound to its saved evidence",
		recordsAReviewJsonFileBoundToItsSavedEvidence,
	);
	it(
		"refuses conflicting file and describing flags without writing a review",
		refusesConflictingFileAndDescribingFlagsWithoutWritingAReview,
	);
});

async function writesAndReadsTheSameSessionReviewThroughTheCli(): Promise<void> {
	const fixture = await savedAttempt();
	const request = new ReviewRequestBuilder({
		id: fixture.id,
		json: true,
		runsDirectory: fixture.root,
	}).build();
	const write = recordOutput();
	const read = recordOutput();

	await runReview(
		{ ...request, summary: "The work is incomplete.", verdict: "FAIL" },
		write.output,
	);
	await runReview(request, read.output);

	expect(JSON.parse(read.stdout[FIRST_OUTPUT] ?? "")).toMatchObject({
		review: { summary: "The work is incomplete.", verdict: "FAIL" },
	});
	expect(read.stdout).toEqual(write.stdout);
}

async function recordsAReviewJsonFileBoundToItsSavedEvidence(): Promise<void> {
	const fixture = await savedAttempt();
	const file = `${fixture.paths.recordFile}.input.json`;
	await Bun.write(file, JSON.stringify(await reviewFor(fixture)));
	const { output, stdout } = recordOutput();

	await runReview(
		new ReviewRequestBuilder({
			file,
			id: fixture.id,
			json: true,
			runsDirectory: fixture.root,
		}).build(),
		output,
	);

	expect(JSON.parse(stdout[FIRST_OUTPUT] ?? "")).toMatchObject({
		review: { verdict: "FAIL" },
	});
}

async function refusesConflictingFileAndDescribingFlagsWithoutWritingAReview(): Promise<void> {
	const fixture = await savedAttempt();
	const { output } = recordOutput();

	const error = await failureOf(
		runReview(
			new ReviewRequestBuilder({
				file: "unused.json",
				id: fixture.id,
				runsDirectory: fixture.root,
				verdict: "PASS",
			}).build(),
			output,
		),
	);

	expect(error).toBeInstanceOf(UsageError);
}

async function readsHumanContext(): Promise<void> {
	const fixture = await savedAttempt();
	const { output, stdout } = recordOutput();
	await runReview(
		new ReviewRequestBuilder({
			id: fixture.id,
			runsDirectory: fixture.root,
		}).build(),
		output,
	);
	expect(stdout.join("")).toContain("Human review: not recorded");
	expect(stdout.join("")).toContain("Source SHA-256:");
}

async function escapesReviewText(): Promise<void> {
	const fixture = await savedAttempt();
	const summary = "unsafe\u001B[2J\u001B[H\u202Ereview";
	const request = new ReviewRequestBuilder({
		id: fixture.id,
		runsDirectory: fixture.root,
	}).build();
	const write = recordOutput();
	const read = recordOutput();
	await runReview({ ...request, summary, verdict: "FAIL" }, write.output);
	await runReview({ ...request, json: true }, read.output);
	expect(write.stdout.join("")).toContain(
		String.raw`unsafe\u001b[2J\u001b[H\u202ereview`,
	);
	expect(JSON.parse(read.stdout[FIRST_OUTPUT] ?? "")).toMatchObject({
		review: { summary },
	});
	expect(read.stdout.join("")).not.toContain("\u202E");
}
