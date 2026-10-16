import { afterEach, expect, it } from "bun:test";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RecordedRunsFixture } from "#benchmark/run-records-test-support";
import { benchmarkRunPaths } from "#benchmark/run-layout";
import { expectHistoryError } from "./evidence-test-support";
import { readFinalAssessment, readStageOutput } from "./run-investigation";

const directories: string[] = [];
afterEach(async () => {
	await Promise.all(
		directories
			.splice(0)
			.map((path) => rm(path, { recursive: true, force: true })),
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
			stage: "build",
			input: {
				artifact: { path: "plan.md", content: "The actual saved plan" },
				diff: "unrelated diff",
			},
		}),
	);
	expect(
		await readStageOutput({
			runsDirectory: fixture.runsDirectory,
			run,
			stage: "build",
		}),
	).toEqual({
		state: "available",
		kind: "artifact",
		path: "plan.md",
		text: "The actual saved plan",
	});
});

it("uses the last COMPLETE agent reply even when a later exchange is a QUESTION", async () => {
	const fixture = await recordedRun();
	const run = fixture.replayableRun;
	await Bun.write(
		benchmarkRunPaths(fixture.runsDirectory, run).stageFile("build"),
		JSON.stringify({
			stage: "build",
			input: {
				diff: "saved delivery diff",
				transcript: {
					stage: "build",
					sessionId: "saved-session",
					costUsd: 0,
					providerCalls: [],
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
				},
			},
		}),
	);
	expect(
		await readStageOutput({
			runsDirectory: fixture.runsDirectory,
			run,
			stage: "build",
		}),
	).toMatchObject({
		state: "available",
		kind: "reply",
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
			runsDirectory: fixture.runsDirectory,
			run,
			stage: "build",
		}),
	).toMatchObject({ state: "unavailable" });
	await expectHistoryError(
		readStageOutput({
			runsDirectory: fixture.runsDirectory,
			run,
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
			stage: "discuss",
			input: { artifact: { path: "plan.md", content: "Wrong step output" } },
		}),
	);
	await expectHistoryError(
		readStageOutput({
			runsDirectory: fixture.runsDirectory,
			run,
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
			stage: "build",
			input: {
				diff: "The actual delivery diff",
				transcript: {
					stage: "build",
					sessionId: "saved",
					costUsd: 0,
					providerCalls: [],
					exchanges: [
						{
							agent: {
								status: "QUESTION",
								message: "A question is not output",
							},
						},
					],
				},
			},
		}),
	);
	expect(
		await readStageOutput({
			runsDirectory: fixture.runsDirectory,
			run,
			stage: "build",
		}),
	).toEqual({
		state: "available",
		kind: "diff",
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
				summary: "The final response omitted hasMore.",
				requirements: [
					{
						id: "empty-page",
						status: "FAIL",
						evidence: [
							{
								source: "diff",
								path: "delivery.diff",
								claim: "hasMore is absent",
								quote: "return { items: [] }",
							},
						],
					},
				],
			},
		}),
	);
	expect(
		await readFinalAssessment({ runsDirectory: fixture.runsDirectory, run }),
	).toMatchObject({
		state: "available",
		summary: "The final response omitted hasMore.",
		requirements: [
			{
				id: "empty-page",
				status: "FAIL",
				evidence: [
					{ claim: "hasMore is absent", quote: "return { items: [] }" },
				],
			},
		],
	});
});

it("refuses a final record symlink to another file within the records directory", async () => {
	const fixture = await recordedRun();
	const run = fixture.replayableRun;
	const path = benchmarkRunPaths(fixture.runsDirectory, run).artifactFile;
	await rm(path, { force: true });
	const outside = join(directories.at(-1) ?? "", "outside.json");
	await Bun.write(outside, JSON.stringify({ grade: { requirements: [] } }));
	await symlink(outside, path);
	await expectHistoryError(
		readFinalAssessment({ runsDirectory: fixture.runsDirectory, run }),
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
				requirements: [{ id: "step-only", status: "PASS", evidence: [] }],
			},
		}),
	);
	await expectHistoryError(
		readFinalAssessment({
			runsDirectory: fixture.runsDirectory,
			run: `${run}.build`,
		}),
		"not-found",
	);
});
