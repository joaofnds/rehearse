import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AnalysisDependencies, AnalysisInvoker } from "./culprit-analysis";
import { analysisSessionArgs, analyzeRun } from "./culprit-analysis";
import { assembleCulpritBundle } from "./culprit-bundle";
import { ClaudeSessionError, parseClaudeEnvelope } from "./claude";
import { RefusedPreconditionError } from "./exit-codes";
import { recordPaused } from "./run-pause";
import type { RunLiveness } from "./run-liveness";
import type { ClaudeEnvelope } from "./contracts";
import {
	RUN,
	runStoppedAtBuild,
	runWithOneGradedStep,
} from "./culprit-analysis-test-support";
import { benchmarkRunPaths } from "./run-layout";
import { nothingRunning } from "./run-records-test-support";
import { budgetHaltEnvelope } from "./test-support";
import { failureOf } from "#cli/cli-test-support";

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
	public readonly prompts: string[] = [];
	private reply: ClaudeEnvelope | Error = answering(ANSWER);

	public answer(envelope: ClaudeEnvelope): void {
		this.reply = envelope;
	}

	public fail(error: Readonly<Error>): void {
		this.reply = error;
	}

	public readonly invoke: AnalysisInvoker = (prompt, budgetUsd) => {
		this.prompts.push(prompt);
		this.budgets.push(budgetUsd);
		if (this.reply instanceof Error) {
			return Promise.reject(this.reply);
		}

		return Promise.resolve(JSON.stringify(this.reply));
	};
}

const RUNNING_PID = 4242;

const stillRunning: RunLiveness = {
	readMarker: () => Promise.resolve({ pid: RUNNING_PID }),
	isAlive: (pid) => pid === RUNNING_PID,
};

/** Every file under `root`, by its path below it, with its bytes. */
async function snapshot(root: string): Promise<Map<string, string>> {
	const files = new Map<string, string>();
	for (const entry of await readdir(root, {
		recursive: true,
		withFileTypes: true,
	})) {
		if (entry.isFile()) {
			const path = join(entry.parentPath, entry.name);
			files.set(path.slice(root.length), await Bun.file(path).text());
		}
	}

	return files;
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
		progress: () => undefined,
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

	it("records the digest and size of the bundle the session read", async () => {
		const directory = await runsDirectory();
		await runStoppedAtBuild(directory);
		const bundle = JSON.stringify(await assembleCulpritBundle(directory, RUN));
		const provider = new FakeAnalysisProvider();

		const { record } = await analyzeRun(
			{ runsDirectory: directory, run: RUN, model: "sonnet", capUsd: 1 },
			dependencies(provider.invoke),
		);

		expect(provider.prompts[0]).toContain(bundle);
		expect(record).toMatchObject({
			bundleDigest: new Bun.CryptoHasher("sha256").update(bundle).digest("hex"),
			bundleBytes: Buffer.byteLength(bundle),
		});
	});

	it.each([
		["spends at most the cap when the ceiling is higher", 1, 30, 1],
		["spends at most the ceiling when the cap is higher", 5, 2, 2],
	])("%s", async (_case, capUsd, ceilingUsd, budgetUsd) => {
		const directory = await runsDirectory();
		await runStoppedAtBuild(directory);
		const provider = new FakeAnalysisProvider();

		await analyzeRun(
			{ runsDirectory: directory, run: RUN, model: "sonnet", capUsd },
			{
				...dependencies(provider.invoke),
				requireSpendCeiling: () => Promise.resolve(ceilingUsd),
			},
		);

		expect(provider.budgets).toEqual([budgetUsd]);
	});

	it("states the most it can spend before the call", async () => {
		const directory = await runsDirectory();
		await runStoppedAtBuild(directory);
		const events: string[] = [];
		const provider = new FakeAnalysisProvider();

		await analyzeRun(
			{ runsDirectory: directory, run: RUN, model: "sonnet", capUsd: 5 },
			{
				...dependencies((prompt, budgetUsd) => {
					events.push("call");

					return provider.invoke(prompt, budgetUsd);
				}),
				requireSpendCeiling: () => Promise.resolve(2),
				progress: (message) => {
					events.push(message);
				},
			},
		);

		expect(events).toEqual([
			`Analyzing run ${RUN} with sonnet; the call spends at most $2.`,
			"call",
		]);
	});

	it("keeps a second analysis beside the first and changes nothing else", async () => {
		const directory = await runsDirectory();
		await runStoppedAtBuild(directory);
		const analyses = dependencies(new FakeAnalysisProvider().invoke);
		const first = await analyzeRun(
			{ runsDirectory: directory, run: RUN, model: "sonnet", capUsd: 1 },
			analyses,
		);
		const before = await snapshot(directory);

		const second = await analyzeRun(
			{ runsDirectory: directory, run: RUN, model: "sonnet", capUsd: 1 },
			analyses,
		);

		const after = await snapshot(directory);
		after.delete(second.file.slice(directory.length));
		expect(second.file).not.toBe(first.file);
		expect(after).toEqual(before);
	});

	it("analyzes a run whose process died before it had an outcome", async () => {
		const directory = await runsDirectory();
		await runWithOneGradedStep(directory);
		const provider = new FakeAnalysisProvider();
		provider.answer(
			answering({ ...ANSWER, culprit: null, steps: [ANSWER.steps[0]] }),
		);

		const { record } = await analyzeRun(
			{ runsDirectory: directory, run: RUN, model: "sonnet", capUsd: 1 },
			dependencies(provider.invoke),
		);

		expect(record).toMatchObject({
			outcome: "recorded",
			culprit: null,
			steps: [
				ANSWER.steps[0],
				{ step: "build", role: "never ran" },
				{ step: "review", role: "never ran" },
			],
		});
	});

	describe("when the run cannot be analyzed", () => {
		it("refuses a run with no records before any call", async () => {
			const directory = await runsDirectory();
			const provider = new FakeAnalysisProvider();

			const failure = await failureOf(
				analyzeRun(
					{ runsDirectory: directory, run: RUN, model: "sonnet", capUsd: 1 },
					dependencies(provider.invoke),
				),
			);

			expect(failure).toBeInstanceOf(RefusedPreconditionError);
			expect(provider.budgets).toEqual([]);
		});

		it("refuses a run still in flight before any call", async () => {
			const directory = await runsDirectory();
			await runWithOneGradedStep(directory);
			const provider = new FakeAnalysisProvider();

			const failure = await failureOf(
				analyzeRun(
					{ runsDirectory: directory, run: RUN, model: "sonnet", capUsd: 1 },
					{ ...dependencies(provider.invoke), liveness: stillRunning },
				),
			);

			expect(failure).toBeInstanceOf(RefusedPreconditionError);
			expect(provider.budgets).toEqual([]);
		});

		it("refuses a paused run before any call", async () => {
			const directory = await runsDirectory();
			await runWithOneGradedStep(directory);
			await recordPaused(
				benchmarkRunPaths(directory, RUN),
				"shape",
				"2026-10-04T11:00:00.000Z",
			);
			const provider = new FakeAnalysisProvider();

			const failure = await failureOf(
				analyzeRun(
					{ runsDirectory: directory, run: RUN, model: "sonnet", capUsd: 1 },
					dependencies(provider.invoke),
				),
			);

			expect(failure).toBeInstanceOf(RefusedPreconditionError);
			expect(provider.budgets).toEqual([]);
		});

		it("refuses when no spend ceiling is stored before any call", async () => {
			const directory = await runsDirectory();
			await runStoppedAtBuild(directory);
			const provider = new FakeAnalysisProvider();

			const failure = await failureOf(
				analyzeRun(
					{ runsDirectory: directory, run: RUN, model: "sonnet", capUsd: 1 },
					{
						...dependencies(provider.invoke),
						requireSpendCeiling: () =>
							Promise.reject(new RefusedPreconditionError("no ceiling")),
					},
				),
			);

			expect(failure).toBeInstanceOf(RefusedPreconditionError);
			expect(provider.budgets).toEqual([]);
		});
	});
});

describe(analysisSessionArgs.name, () => {
	it("runs the session sealed, under the model and the budget it is given", () => {
		const args = analysisSessionArgs("sonnet", 1);

		expect(args).toContain("--safe-mode");
		expect(
			args.slice(args.indexOf("--tools"), args.indexOf("--tools") + 2),
		).toEqual(["--tools", ""]);
		expect(
			args.slice(args.indexOf("--model"), args.indexOf("--model") + 2),
		).toEqual(["--model", "sonnet"]);
		expect(
			args.slice(
				args.indexOf("--max-budget-usd"),
				args.indexOf("--max-budget-usd") + 2,
			),
		).toEqual(["--max-budget-usd", "1"]);
		expect(args).not.toContain("--dangerously-skip-permissions");
	});
});
