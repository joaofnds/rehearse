import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import type { z } from "zod";

import type { Immutable, humanFindingSchema } from "#benchmark/contracts";
import { humanReviewSchema } from "#benchmark/contracts";
import { benchmarkRunPaths } from "#benchmark/run-layout";
import {
	CliTestWorkspace,
	failureOf,
	recordOutput,
} from "#cli/cli-test-support";
import { UsageError } from "#cli/commands";
import runReview from "#cli/review-command";

import ReviewRequestBuilder from "./review-request-test-builder";

const workspace = CliTestWorkspace.forEachTest();

const RUN_NAME = "2026-09-03T00-00-00.000Z";

class HumanFindingBuilder {
	public constructor(
		private readonly overrides: Immutable<
			Partial<z.infer<typeof humanFindingSchema>>
		> = {},
	) {}
	public build(): z.infer<typeof humanFindingSchema> {
		const { paths = ["src/audit/worker.ts"], ...overrides } = this.overrides;

		return {
			description: "The worker drops request metadata.",
			judgeAssessment: "MISSED",
			paths: [...paths],
			rubricId: "worker-metadata",
			stage: "build",
			...overrides,
		};
	}
}

const finding = new HumanFindingBuilder().build();

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

async function writesTheReviewTheFlagsDescribe(): Promise<void> {
	const runsDirectory = await runsDirectoryWithArtifact();
	const { output, stdout } = recordOutput();

	await runReview(
		new ReviewRequestBuilder({
			findings: [JSON.stringify(finding)],
			runsDirectory,
			summary: "The worker loses metadata.",
			verdict: "REJECT",
		}).build(),
		output,
	);

	const { reviewFile } = benchmarkRunPaths(runsDirectory, RUN_NAME);
	const written = humanReviewSchema.parse(
		JSON.parse(await Bun.file(reviewFile).text()),
	);
	expect(written.verdict).toBe("REJECT");
	expect(written.summary).toBe("The worker loses metadata.");
	expect(written.findings).toEqual([finding]);
	expect(stdout).toEqual([`${reviewFile}\n`]);
}

async function recordsRepeatedFindingsInTheOrderTheyWereGiven(): Promise<void> {
	const runsDirectory = await runsDirectoryWithArtifact();
	const { output } = recordOutput();
	const second = new HumanFindingBuilder({
		rubricId: "worker-ordering",
	}).build();

	await runReview(
		new ReviewRequestBuilder({
			findings: [JSON.stringify(finding), JSON.stringify(second)],
			runsDirectory,
			summary: "Two defects.",
			verdict: "REJECT",
		}).build(),
		output,
	);

	const written = humanReviewSchema.parse(
		JSON.parse(await readReviewText(runsDirectory)),
	);
	expect(written.findings.map(({ rubricId }) => rubricId)).toEqual([
		"worker-metadata",
		"worker-ordering",
	]);
}

async function writesTheParsedReviewAFileNames(): Promise<void> {
	const runsDirectory = await runsDirectoryWithArtifact();
	const file = join(runsDirectory, "given.json");
	await Bun.write(
		file,
		JSON.stringify({
			findings: [],
			summary: "Nothing to promote.",
			verdict: "ACCEPT",
		}),
	);
	const { output } = recordOutput();

	await runReview(
		new ReviewRequestBuilder({ file, runsDirectory }).build(),
		output,
	);

	const written = humanReviewSchema.parse(
		JSON.parse(await readReviewText(runsDirectory)),
	);
	expect(written.verdict).toBe("ACCEPT");
}

async function refusesAFileTheSchemaRejectsAndLeavesThe(): Promise<void> {
	const runsDirectory = await runsDirectoryWithArtifact();
	const { reviewFile } = benchmarkRunPaths(runsDirectory, RUN_NAME);
	await Bun.write(reviewFile, "the review already there");
	const file = join(runsDirectory, "given.json");
	await Bun.write(file, JSON.stringify({ verdict: "MAYBE" }));
	const { output } = recordOutput();

	const failure = await failureOf(
		runReview(
			new ReviewRequestBuilder({ file, runsDirectory }).build(),
			output,
		),
	);

	expect(failure).toBeInstanceOf(UsageError);
	expect(await Bun.file(reviewFile).text()).toBe("the review already there");
}

describe(runReview.name, () => {
	it("writes the review the flags describe", writesTheReviewTheFlagsDescribe);
	it(
		"records repeated findings in the order they were given",
		recordsRepeatedFindingsInTheOrderTheyWereGiven,
	);
	it(
		"writes the parsed review a --file names",
		writesTheParsedReviewAFileNames,
	);
	it(
		"refuses a --file the schema rejects and leaves the review file alone",
		refusesAFileTheSchemaRejectsAndLeavesThe,
	);
});
