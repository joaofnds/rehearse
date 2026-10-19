import { describe, expect, it } from "bun:test";

import { humanReviewSchema } from "#benchmark/contracts";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { benchmarkRunPaths } from "#benchmark/run-layout";
import {
	CliTestWorkspace,
	failureOf,
	recordOutput,
} from "#cli/cli-test-support";
import { UsageError } from "#cli/command-usage";
import runReview from "#cli/review-command";

import ReviewRequestBuilder from "./review-request-test-builder";

const workspace = CliTestWorkspace.forEachTest();

const RUN_NAME = "2026-09-03T00-00-00.000Z";

async function runsDirectoryWithArtifact(): Promise<string> {
	const runsDirectory = await workspace.createDirectory("rehearse-runs-");
	await Bun.write(
		benchmarkRunPaths(runsDirectory, RUN_NAME).artifactFile,
		JSON.stringify({ status: "AWAITING_HUMAN_REVIEW" }),
	);

	return runsDirectory;
}

async function readReviewText(runsDirectory: string): Promise<string> {
	const paths = benchmarkRunPaths(runsDirectory, RUN_NAME);
	const text = await Bun.file(paths.reviewFile).text();
	return text;
}

async function refusesFileTogetherWithTheFlagsThatDescribeA(): Promise<void> {
	const runsDirectory = await runsDirectoryWithArtifact();
	const { output } = recordOutput();

	const failure = await failureOf(
		runReview(
			new ReviewRequestBuilder({
				file: "/tmp/review.json",
				runsDirectory,
				verdict: "REJECT",
			}).build(),
			output,
		),
	);

	expect(failure).toBeInstanceOf(UsageError);
	expect(failure.message).toContain("--file");
	expect(failure.message).toContain("--verdict");
}

async function refusesAReviewDescribedByNeitherFileNorThe(): Promise<void> {
	const runsDirectory = await runsDirectoryWithArtifact();
	const { output } = recordOutput();

	const failure = await failureOf(
		runReview(new ReviewRequestBuilder({ runsDirectory }).build(), output),
	);

	expect(failure).toBeInstanceOf(UsageError);
	expect(failure.message).toContain("--file");
}

async function refusesARunWithNoArtifactAndWritesNo(): Promise<void> {
	const runsDirectory = await workspace.createDirectory("rehearse-runs-");
	const { output } = recordOutput();

	const failure = await failureOf(
		runReview(
			new ReviewRequestBuilder({
				runsDirectory,
				summary: "No run here.",
				verdict: "REJECT",
			}).build(),
			output,
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toContain(RUN_NAME);
	expect(
		await Bun.file(
			benchmarkRunPaths(runsDirectory, RUN_NAME).reviewFile,
		).exists(),
	).toBe(false);
}

async function printsTheReviewRecordSOwnBytesForJson(): Promise<void> {
	const expectedStdoutCount = 1;

	const runsDirectory = await runsDirectoryWithArtifact();
	const { output, stdout } = recordOutput();

	await runReview(
		new ReviewRequestBuilder({
			json: true,
			runsDirectory,
			summary: "The worker loses metadata.",
			verdict: "REJECT",
		}).build(),
		output,
	);

	expect(stdout).toHaveLength(expectedStdoutCount);
	const printed = stdout.join("");
	expect(printed).toBe(await readReviewText(runsDirectory));
	expect(JSON.parse(printed)).toEqual(
		JSON.parse(await readReviewText(runsDirectory)),
	);
}

async function acceptsTheRunAsRunNameAndAsA(): Promise<void> {
	const runsDirectory = await runsDirectoryWithArtifact();
	const { output } = recordOutput();

	await runReview(
		new ReviewRequestBuilder({
			id: `run:${RUN_NAME}`,
			runsDirectory,
			summary: "Prefixed.",
			verdict: "REJECT",
		}).build(),
		output,
	);

	const written = humanReviewSchema.parse(
		JSON.parse(await readReviewText(runsDirectory)),
	);
	expect(written.summary).toBe("Prefixed.");
}

async function refusesARunIdNamingAPathOutsideThe(): Promise<void> {
	const runsDirectory = await runsDirectoryWithArtifact();
	const { output } = recordOutput();

	const failure = await failureOf(
		runReview(
			new ReviewRequestBuilder({
				id: "run:../escape",
				runsDirectory,
				summary: "Escaping.",
				verdict: "REJECT",
			}).build(),
			output,
		),
	);

	expect(failure).toBeInstanceOf(UsageError);
	expect(failure.message).toContain("outside the runs directory");
}

async function refusesAFindingThatIsNotOneJSONFinding(): Promise<void> {
	const runsDirectory = await runsDirectoryWithArtifact();
	const { output } = recordOutput();

	const failure = await failureOf(
		runReview(
			new ReviewRequestBuilder({
				findings: ["not json"],
				runsDirectory,
				summary: "Malformed finding.",
				verdict: "REJECT",
			}).build(),
			output,
		),
	);

	expect(failure).toBeInstanceOf(UsageError);
}

describe(runReview.name, () => {
	it(
		"refuses --file together with the flags that describe a review",
		refusesFileTogetherWithTheFlagsThatDescribeA,
	);
	it(
		"refuses a review described by neither --file nor the flags",
		refusesAReviewDescribedByNeitherFileNorThe,
	);
	it(
		"refuses a run with no artifact and writes no review",
		refusesARunWithNoArtifactAndWritesNo,
	);
	it(
		"prints the review record's own bytes for --json",
		printsTheReviewRecordSOwnBytesForJson,
	);
	it(
		"accepts the run as run:<name> and as a bare name",
		acceptsTheRunAsRunNameAndAsA,
	);
	it(
		"refuses a run id naming a path outside the runs directory",
		refusesARunIdNamingAPathOutsideThe,
	);
	it(
		"refuses a --finding that is not one JSON finding object",
		refusesAFindingThatIsNotOneJSONFinding,
	);
});
