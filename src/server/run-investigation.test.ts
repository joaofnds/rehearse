import { afterEach, expect, it } from "bun:test";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { benchmarkRunPaths } from "#benchmark/run-layout";
import { RecordedRunsFixture } from "#benchmark/run-records-test-support";

import expectHistoryError from "./evidence-test-support";
import { readFinalAssessment, readStageOutput } from "./run-investigation";

const RESOURCE_DRAIN_START_INDEX = 0;
const FINAL_TEST_DIRECTORY_OFFSET = -1;

const directories: string[] = [];
afterEach(async () => {
	await Promise.all(
		directories.splice(RESOURCE_DRAIN_START_INDEX).map(async (path) => {
			await rm(path, { force: true, recursive: true });
		}),
	);
});

async function recordedRun(): Promise<RecordedRunsFixture> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-investigation-"));
	directories.push(root);
	const fixture = new RecordedRunsFixture(root);
	await fixture.write();
	return fixture;
}

it("reads the artifact the step Judge saw, without substituting the diff", async () => {
	const fixture = await recordedRun();
	const run = fixture.replayableRun;
	await Bun.write(
		benchmarkRunPaths(fixture.runsDirectory, run).stageFile("build"),
		JSON.stringify({
			input: {
				artifact: { content: "The actual saved plan", path: "plan.md" },
				diff: "unrelated diff",
			},
			stage: "build",
		}),
	);
	expect(
		await readStageOutput({
			run,
			runsDirectory: fixture.runsDirectory,
			stage: "build",
		}),
	).toEqual({
		kind: "artifact",
		path: "plan.md",
		state: "available",
		text: "The actual saved plan",
	});
});

it("uses the last COMPLETE agent reply even when a later exchange is a QUESTION", async () => {
	const fixture = await recordedRun();
	const run = fixture.replayableRun;
	await Bun.write(
		benchmarkRunPaths(fixture.runsDirectory, run).stageFile("build"),
		JSON.stringify({
			input: {
				diff: "saved delivery diff",
				transcript: {
					costUsd: 0,
					exchanges: [
						{ agent: { message: "Earlier", status: "COMPLETE" } },
						{ agent: { message: "Final saved reply", status: "COMPLETE" } },
						{
							agent: {
								message: "A later question is not completed output",
								status: "QUESTION",
							},
						},
					],
					providerCalls: [],
					sessionId: "saved-session",
					stage: "build",
				},
			},
			stage: "build",
		}),
	);
	expect(
		await readStageOutput({
			run,
			runsDirectory: fixture.runsDirectory,
			stage: "build",
		}),
	).toMatchObject({
		kind: "reply",
		state: "available",
		text: "Final saved reply",
	});
});

it("keeps absent output unavailable and rejects a stage outside the saved workflow", async () => {
	const fixture = await recordedRun();
	const run = fixture.replayableRun;
	await Bun.write(
		benchmarkRunPaths(fixture.runsDirectory, run).stageFile("build"),
		"{}",
	);
	expect(
		await readStageOutput({
			run,
			runsDirectory: fixture.runsDirectory,
			stage: "build",
		}),
	).toMatchObject({ state: "unavailable" });
	await expectHistoryError(
		readStageOutput({
			run,
			runsDirectory: fixture.runsDirectory,
			stage: "../outside",
		}),
		"refused",
	);
});

it("refuses saved output naming a different scorecard stage", async () => {
	const fixture = await recordedRun();
	const run = fixture.replayableRun;
	await Bun.write(
		benchmarkRunPaths(fixture.runsDirectory, run).stageFile("build"),
		JSON.stringify({
			input: { artifact: { content: "Wrong step output", path: "plan.md" } },
			stage: "discuss",
		}),
	);
	await expectHistoryError(
		readStageOutput({
			run,
			runsDirectory: fixture.runsDirectory,
			stage: "build",
		}),
		"refused",
	);
});
it("labels a delivery diff explicitly when no artifact or COMPLETE reply was retained", async () => {
	const fixture = await recordedRun();
	const run = fixture.replayableRun;
	await Bun.write(
		benchmarkRunPaths(fixture.runsDirectory, run).stageFile("build"),
		JSON.stringify({
			input: {
				diff: "The actual delivery diff",
				transcript: {
					costUsd: 0,
					exchanges: [
						{
							agent: {
								message: "A question is not output",
								status: "QUESTION",
							},
						},
					],
					providerCalls: [],
					sessionId: "saved",
					stage: "build",
				},
			},
			stage: "build",
		}),
	);
	expect(
		await readStageOutput({
			run,
			runsDirectory: fixture.runsDirectory,
			stage: "build",
		}),
	).toEqual({
		kind: "diff",
		state: "available",
		text: "The actual delivery diff",
	});
});
it("returns final criteria with their saved citations, independently of step grades", async () => {
	const fixture = await recordedRun();
	const run = fixture.replayableRun;
	await Bun.write(
		benchmarkRunPaths(fixture.runsDirectory, run).artifactFile,
		JSON.stringify({
			grade: {
				requirements: [
					{
						evidence: [
							{
								claim: "hasMore is absent",
								path: "delivery.diff",
								quote: "return { items: [] }",
								source: "diff",
							},
						],
						id: "empty-page",
						status: "FAIL",
					},
				],
				summary: "The final response omitted hasMore.",
			},
		}),
	);
	expect(
		await readFinalAssessment({ run, runsDirectory: fixture.runsDirectory }),
	).toMatchObject({
		requirements: [
			{
				evidence: [
					{ claim: "hasMore is absent", quote: "return { items: [] }" },
				],
				id: "empty-page",
				status: "FAIL",
			},
		],
		state: "available",
		summary: "The final response omitted hasMore.",
	});
});

it("refuses a final record symlink to another file within the records directory", async () => {
	const fixture = await recordedRun();
	const run = fixture.replayableRun;
	const path = benchmarkRunPaths(fixture.runsDirectory, run).artifactFile;
	await rm(path, { force: true });
	const outside = join(
		directories.at(FINAL_TEST_DIRECTORY_OFFSET) ?? "",
		"outside.json",
	);
	await Bun.write(outside, JSON.stringify({ grade: { requirements: [] } }));
	await symlink(outside, path);
	await expectHistoryError(
		readFinalAssessment({ run, runsDirectory: fixture.runsDirectory }),
		"refused",
	);
});

it("does not relabel a step scorecard as a final run assessment", async () => {
	const fixture = await recordedRun();
	const run = fixture.replayableRun;
	await Bun.write(
		benchmarkRunPaths(fixture.runsDirectory, run).stageFile("build"),
		JSON.stringify({
			grade: {
				requirements: [{ evidence: [], id: "step-only", status: "PASS" }],
			},
		}),
	);
	await expectHistoryError(
		readFinalAssessment({
			run: `${run}.build`,
			runsDirectory: fixture.runsDirectory,
		}),
		"not-found",
	);
});
