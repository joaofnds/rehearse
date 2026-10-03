import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AnalysisDependencies, AnalysisInvoker } from "./culprit-analysis";
import { analyzeRun } from "./culprit-analysis";
import { ClaudeSessionError, parseClaudeEnvelope } from "./claude";
import type { ClaudeEnvelope } from "./contracts";
import type { RunManifest } from "./manifest";
import { writeRunManifest } from "./manifest";
import type { ReadManifestEntry } from "./read-manifest";
import { benchmarkRunPaths } from "./run-layout";
import { nothingRunning } from "./run-records-test-support";
import { budgetHaltEnvelope } from "./test-support";

const RUN = "2026-10-04T10-00-00.000Z";
const SOURCE_ROOT = "/fixture/target";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
	);
});

async function runsDirectory(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-culprit-"));
	roots.push(root);

	return root;
}

function manifest(stages: readonly string[]): RunManifest {
	return {
		caseId: "audit-log",
		timestamp: "2026-10-04T10:00:00.000Z",
		controlSha: "1".repeat(40),
		sourceRoot: SOURCE_ROOT,
		sourceSha: "2".repeat(40),
		taskId: "ACT-1",
		taskSha: "3".repeat(40),
		task: "add an audit log module",
		productBrief: "the brief",
		model: "sonnet",
		judgeModel: "opus",
		sessionBudgetUsd: 5,
		pipelinePath: "cases/audit-log/pipelines/default.json",
		pipeline: {
			statuses: ["To Do", "Build", "Done"],
			target: {
				checks: [{ command: ["bun", "run", "typecheck"] }],
				integrityFiles: ["package.json"],
			},
			stages: stages.map((name) => ({
				name,
				kind: "delivery",
				skill: name,
				rubric: `${name}.json`,
			})),
		},
	};
}

interface StageFixture {
	readonly stage: string;
	readonly status?: "STAGE_JUDGE_FAILED";
	readonly error?: string;
	readonly grade: {
		readonly grade: string;
		readonly verdict: string;
		readonly summary: string;
	};
	readonly readManifest: readonly ReadManifestEntry[];
}

function readEntry(path: string): ReadManifestEntry {
	return {
		path,
		half: "corpus",
		role: "read for context",
		evidence: "declared and observed",
	};
}

function gradedStage(stage: string, reads: readonly string[]): StageFixture {
	return {
		stage,
		grade: { grade: "B", verdict: "CONTINUE", summary: `${stage} held` },
		readManifest: reads.map((path) => readEntry(path)),
	};
}

function stoppedStage(stage: string, reads: readonly string[]): StageFixture {
	return {
		status: "STAGE_JUDGE_FAILED",
		stage,
		error: `${stage} stage graded D; minimum grade is B`,
		grade: { grade: "D", verdict: "STOP", summary: `${stage} missed` },
		readManifest: reads.map((path) => readEntry(path)),
	};
}

async function writeStage(file: string, record: StageFixture): Promise<void> {
	await Bun.write(file, `${JSON.stringify(record, null, 2)}\n`);
}

/** A run of shape, build and review that stopped at build. */
async function runStoppedAtBuild(directory: string): Promise<void> {
	const paths = benchmarkRunPaths(directory, RUN);
	await writeRunManifest(
		paths.manifestFile,
		manifest(["shape", "build", "review"]),
	);
	await writeStage(
		paths.stageFile("shape"),
		gradedStage("shape", ["CLAUDE.md", "skills/shape/SKILL.md"]),
	);
	await writeStage(
		paths.stageFile("build"),
		stoppedStage("build", ["CLAUDE.md", "skills/build/SKILL.md"]),
	);
}

const ANSWER = {
	culprit: {
		step: "build",
		file: "skills/build/SKILL.md",
		lines: { start: 3, end: 5 },
	},
	narrative: "the build skill never asks for a direct run",
	pairedRerun: "replay build with the run step restored",
	steps: [
		{
			step: "shape",
			role: "not implicated",
			note: "the card was complete",
			contribution: "left the grade where it was",
		},
		{
			step: "build",
			role: "primary culprit",
			note: "no direct run was recorded",
			contribution: "cost the observed-result requirement",
		},
	],
} as const;

function answering(
	structuredOutput: ClaudeEnvelope["structured_output"],
): ClaudeEnvelope {
	return {
		session_id: "analysis-session",
		total_cost_usd: 0.24,
		structured_output: structuredOutput,
	};
}

/**
 * Answers every call with one envelope, or fails it the way the session
 * runner does, and keeps the budgets it was given.
 */
class FakeAnalysisProvider {
	public readonly budgets: number[] = [];
	private reply: ClaudeEnvelope | Error = answering(ANSWER);

	public answer(envelope: ClaudeEnvelope): void {
		this.reply = envelope;
	}

	public fail(error: Readonly<Error>): void {
		this.reply = error;
	}

	public readonly invoke: AnalysisInvoker = (_prompt, budgetUsd) => {
		this.budgets.push(budgetUsd);
		if (this.reply instanceof Error) {
			return Promise.reject(this.reply);
		}

		return Promise.resolve(JSON.stringify(this.reply));
	};
}

/** Each read moves four seconds on from the last. */
function steppingClock(): () => Date {
	let tick = 0;

	return () => {
		const moment = new Date(Date.UTC(2026, 9, 4, 12, 0, tick * 4));
		tick += 1;

		return moment;
	};
}

function dependencies(invoke: AnalysisInvoker): AnalysisDependencies {
	return {
		invoke,
		now: steppingClock(),
		liveness: nothingRunning,
		requireSpendCeiling: () => Promise.resolve(30),
	};
}

describe(analyzeRun.name, () => {
	it("gives a step that never ran the role never ran", async () => {
		const directory = await runsDirectory();
		await runStoppedAtBuild(directory);

		const { record } = await analyzeRun(
			{ runsDirectory: directory, run: RUN, model: "sonnet", capUsd: 1 },
			dependencies(new FakeAnalysisProvider().invoke),
		);

		expect(record).toMatchObject({
			steps: [
				ANSWER.steps[0],
				ANSWER.steps[1],
				{ step: "review", role: "never ran" },
			],
		});
	});

	it("keeps the answer with its cost, duration and start in its own file", async () => {
		const directory = await runsDirectory();
		await runStoppedAtBuild(directory);

		const { file, record } = await analyzeRun(
			{ runsDirectory: directory, run: RUN, model: "sonnet", capUsd: 1 },
			dependencies(new FakeAnalysisProvider().invoke),
		);

		expect(record).toMatchObject({
			outcome: "recorded",
			run: RUN,
			model: "sonnet",
			capUsd: 1,
			startedAt: "2026-10-04T12:00:00.000Z",
			durationMs: 4000,
			costUsd: 0.24,
			culprit: ANSWER.culprit,
			narrative: ANSWER.narrative,
			pairedRerun: ANSWER.pairedRerun,
		});
		expect(await Bun.file(file).json()).toEqual(record);
		expect(file).toBe(
			join(directory, "analyses", RUN, "2026-10-04T12-00-00.000Z.json"),
		);
	});

	describe("when the answer breaks a rule of the analysis", () => {
		it.each([
			[
				"names a culprit file the culprit step never read",
				{
					...ANSWER,
					culprit: { step: "build", file: "skills/shape/SKILL.md" },
				},
			],
			[
				"names a culprit step that never ran",
				{ ...ANSWER, culprit: { step: "review", file: "CLAUDE.md" } },
			],
			[
				"names two primary culprits",
				{
					...ANSWER,
					steps: [
						{ ...ANSWER.steps[0], role: "primary culprit" },
						ANSWER.steps[1],
					],
				},
			],
			[
				"names a culprit whose step is not the primary culprit",
				{
					...ANSWER,
					steps: [
						ANSWER.steps[0],
						{ ...ANSWER.steps[1], role: "contributing" },
					],
				},
			],
			[
				"names a primary culprit without a culprit",
				{ ...ANSWER, culprit: null },
			],
			["leaves out a step that ran", { ...ANSWER, steps: [ANSWER.steps[1]] }],
			[
				"reads a step that never ran",
				{
					...ANSWER,
					steps: [...ANSWER.steps, { ...ANSWER.steps[0], step: "review" }],
				},
			],
			["answers outside the analysis shape", { ...ANSWER, narrative: "" }],
		])(
			"records the failure with its cost when it %s",
			async (_case, answer) => {
				const directory = await runsDirectory();
				await runStoppedAtBuild(directory);
				const provider = new FakeAnalysisProvider();
				provider.answer(answering(answer));

				const { file, record } = await analyzeRun(
					{ runsDirectory: directory, run: RUN, model: "sonnet", capUsd: 1 },
					dependencies(provider.invoke),
				);

				expect(record).toMatchObject({
					outcome: "failed",
					costUsd: 0.24,
					payload: answer,
				});
				expect(await Bun.file(file).json()).toEqual(record);
			},
		);
	});

	describe("when the provider halts the session", () => {
		it("records the failure with what the session spent", async () => {
			const directory = await runsDirectory();
			await runStoppedAtBuild(directory);
			const halt = new ClaudeSessionError(
				parseClaudeEnvelope(await budgetHaltEnvelope()),
			);
			const provider = new FakeAnalysisProvider();
			provider.fail(halt);

			const { record } = await analyzeRun(
				{ runsDirectory: directory, run: RUN, model: "sonnet", capUsd: 1 },
				dependencies(provider.invoke),
			);

			expect(record).toMatchObject({
				outcome: "failed",
				reason: halt.message,
				costUsd: halt.costUsd,
			});
		});
	});
});
