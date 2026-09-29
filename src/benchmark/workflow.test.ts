import { describe, expect, it } from "bun:test";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { failureOf } from "#cli/cli-test-support";
import { runJsonSession, runStreamedSession } from "./claude";
import { STAGE_SILENCE_LIMIT_MS } from "./config";
import type { SpendCeiling } from "./spend-ceiling";
import { createSpendCeiling, SpendCeilingReachedError } from "./spend-ceiling";
import {
	budgetHaltEnvelope,
	haltingCommand,
	TestResources,
} from "./test-support";
import type {
	ClaudeCommand,
	ProductOwner,
	WorkflowStageRequest,
} from "./workflow";
import {
	createProductOwner,
	runWorkflowStage,
	WorkflowExecutionError,
} from "./workflow";

const testResources = TestResources.forEachTest();

async function productOwnerParent(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "rehearse-po-test-"));
	testResources.track(directory);

	return directory;
}

describe(createProductOwner.name, () => {
	it("creates its working directory before it asks its first question", async () => {
		const directory = join(await productOwnerParent(), "product-owner");
		const workingDirectories: boolean[] = [];
		const productOwner = createProductOwner(
			{
				directory,
				model: "sonnet",
				sessionBudgetUsd: 5,
				spendCeiling: createSpendCeiling({ ceilingUsd: 100 }),
				task: "Build it",
				productBrief: "Keep it small",
			},
			async (_command, cwd) => {
				const workingDirectory = await stat(cwd);
				workingDirectories.push(workingDirectory.isDirectory());

				return JSON.stringify({
					session_id: "po-session",
					total_cost_usd: 0.2,
					structured_output: { answer: "Use the small scope" },
				});
			},
		);

		await productOwner.ask("shape", "Which scope?");

		expect(workingDirectories).toEqual([true]);
	});
});

describe("workflow provider metrics", () => {
	it("retains Product Owner calls when later metrics are absent", async () => {
		const responses = [
			JSON.stringify({
				session_id: "po-session",
				total_cost_usd: 0.2,
				num_turns: 2,
				usage: {
					input_tokens: 50,
					output_tokens: 10,
					cache_read_input_tokens: 5,
					cache_creation_input_tokens: 6,
				},
				structured_output: { answer: "Use the small scope" },
			}),
			JSON.stringify({
				session_id: "po-session",
				total_cost_usd: 0.2,
				structured_output: { answer: "Keep the same scope" },
			}),
		];
		const productOwner = createProductOwner(
			{
				directory: tmpdir(),
				model: "sonnet",
				sessionBudgetUsd: 5,
				spendCeiling: createSpendCeiling({ ceilingUsd: 100 }),
				task: "Build it",
				productBrief: "Keep it small",
			},
			() => Promise.resolve(responses.shift() ?? ""),
		);

		await productOwner.ask("shape", "Which scope?");
		await productOwner.ask("shape", "Any constraints?");

		expect(productOwner.snapshot()).toEqual({
			sessionId: "po-session",
			spentUsd: 0.2,
			providerCalls: [
				{
					metrics: {
						costUsd: 0.2,
						inputTokens: 50,
						outputTokens: 10,
						cacheReadTokens: 5,
						cacheWriteTokens: 6,
						turns: 2,
					},
				},
				{},
			],
		});
	});

	it("charges a resumed Product Owner call only its increase over the session's reported total", async () => {
		const usage = {
			input_tokens: 50,
			output_tokens: 10,
			cache_read_input_tokens: 5,
			cache_creation_input_tokens: 6,
		};
		const responses = [
			JSON.stringify({
				session_id: "po-session",
				total_cost_usd: 0.2,
				num_turns: 1,
				usage,
				structured_output: { answer: "Use the small scope" },
			}),
			JSON.stringify({
				session_id: "po-session",
				total_cost_usd: 0.5,
				num_turns: 1,
				usage,
				structured_output: { answer: "Keep the same scope" },
			}),
		];
		const productOwner = createProductOwner(
			{
				directory: tmpdir(),
				model: "sonnet",
				sessionBudgetUsd: 5,
				spendCeiling: createSpendCeiling({ ceilingUsd: 100 }),
				task: "Build it",
				productBrief: "Keep it small",
			},
			() => Promise.resolve(responses.shift() ?? ""),
		);

		await productOwner.ask("shape", "Which scope?");
		await productOwner.ask("shape", "Any constraints?");

		const { spentUsd, providerCalls } = productOwner.snapshot();
		const [first, resumed] = providerCalls;
		expect(spentUsd).toBe(0.5);
		expect(first?.metrics?.costUsd).toBe(0.2);
		expect(resumed?.metrics?.costUsd).toBeCloseTo(0.3);
	});

	it("keeps an earlier Product Owner snapshot unchanged", async () => {
		const responses = [
			JSON.stringify({
				session_id: "po-session",
				total_cost_usd: 0.2,
				structured_output: { answer: "Use the small scope" },
			}),
			JSON.stringify({
				session_id: "po-session",
				total_cost_usd: 0.2,
				structured_output: { answer: "Keep the same scope" },
			}),
		];
		const productOwner = createProductOwner(
			{
				directory: tmpdir(),
				model: "sonnet",
				sessionBudgetUsd: 5,
				spendCeiling: createSpendCeiling({ ceilingUsd: 100 }),
				task: "Build it",
				productBrief: "Keep it small",
			},
			() => Promise.resolve(responses.shift() ?? ""),
		);
		await productOwner.ask("shape", "Which scope?");
		const firstSnapshot = productOwner.snapshot();

		await productOwner.ask("shape", "Any constraints?");

		expect(firstSnapshot.providerCalls).toHaveLength(1);
	});

	it("retains every worker call and provider turn", async () => {
		const responses = [
			JSON.stringify({
				type: "result",
				session_id: "worker-session",
				total_cost_usd: 0.3,
				num_turns: 2,
				usage: {
					input_tokens: 60,
					output_tokens: 12,
					cache_read_input_tokens: 7,
					cache_creation_input_tokens: 8,
				},
				structured_output: { status: "QUESTION", message: "Which scope?" },
			}),
			JSON.stringify({
				type: "result",
				session_id: "worker-session",
				total_cost_usd: 0.4,
				structured_output: { status: "COMPLETE", message: "Shaped" },
			}),
		];
		const productOwner: ProductOwner = {
			ask: () => Promise.resolve("Use the small scope"),
			snapshot: () => ({
				sessionId: "po-session",
				spentUsd: 0,
				providerCalls: [],
			}),
		};

		const transcript = await runWorkflowStage(
			{
				targetDir: "/target",
				model: "sonnet",
				effort: undefined,
				sessionBudgetUsd: 5,
				spendCeiling: createSpendCeiling({ ceilingUsd: 100 }),
				productOwner,
				taskId: "ACT-5",
				stage: "shape",
				skill: "shape",
			},
			() => Promise.resolve(responses.shift() ?? ""),
		);

		expect(transcript.providerCalls).toEqual([
			{
				metrics: {
					costUsd: 0.3,
					inputTokens: 60,
					outputTokens: 12,
					cacheReadTokens: 7,
					cacheWriteTokens: 8,
					turns: 2,
				},
			},
			{},
		]);
	});

	it("charges a resumed worker call only its increase over the session's reported total", async () => {
		const responses = [
			JSON.stringify({
				type: "result",
				session_id: "worker-session",
				total_cost_usd: 12.4,
				num_turns: 47,
				usage: {
					input_tokens: 60,
					output_tokens: 21_774,
					cache_read_input_tokens: 7,
					cache_creation_input_tokens: 8,
				},
				structured_output: { status: "QUESTION", message: "Which scope?" },
			}),
			JSON.stringify({
				type: "result",
				session_id: "worker-session",
				total_cost_usd: 12.6,
				num_turns: 7,
				usage: {
					input_tokens: 6,
					output_tokens: 2450,
					cache_read_input_tokens: 7,
					cache_creation_input_tokens: 8,
				},
				structured_output: { status: "COMPLETE", message: "Built" },
			}),
		];
		const productOwner: ProductOwner = {
			ask: () => Promise.resolve("Use the small scope"),
			snapshot: () => ({
				sessionId: "po-session",
				spentUsd: 0,
				providerCalls: [],
			}),
		};

		const transcript = await runWorkflowStage(
			{
				targetDir: "/target",
				model: "sonnet",
				effort: undefined,
				sessionBudgetUsd: 15,
				spendCeiling: createSpendCeiling({ ceilingUsd: 100 }),
				productOwner,
				taskId: "ACT-5",
				stage: "build",
				skill: "build",
			},
			() => Promise.resolve(responses.shift() ?? ""),
		);

		const [first, resumed] = transcript.providerCalls;
		expect(transcript.costUsd).toBeCloseTo(12.6);
		expect(first?.metrics?.costUsd).toBe(12.4);
		expect(resumed?.metrics?.costUsd).toBeCloseTo(0.2);
	});

	it("records a turn-completed run event for every provider turn, with the running spend", async () => {
		const responses = [
			JSON.stringify({
				type: "result",
				session_id: "worker-session",
				total_cost_usd: 0.3,
				structured_output: { status: "QUESTION", message: "Which scope?" },
			}),
			JSON.stringify({
				type: "result",
				session_id: "worker-session",
				total_cost_usd: 0.4,
				structured_output: { status: "COMPLETE", message: "Shaped" },
			}),
		];
		const productOwner: ProductOwner = {
			ask: () => Promise.resolve("Use the small scope"),
			snapshot: () => ({
				sessionId: "po-session",
				spentUsd: 0,
				providerCalls: [],
			}),
		};
		const recorded: {
			readonly kind: string;
			readonly spentUsd: number;
			readonly elapsedMs: number;
		}[] = [];

		await runWorkflowStage(
			{
				targetDir: "/target",
				model: "sonnet",
				effort: undefined,
				sessionBudgetUsd: 5,
				spendCeiling: createSpendCeiling({ ceilingUsd: 100 }),
				productOwner,
				taskId: "ACT-5",
				stage: "shape",
				skill: "shape",
				runEvents: {
					record: (kind, _stage, spentUsd, elapsedMs) => {
						recorded.push({ kind, spentUsd, elapsedMs });
					},
					recordJudgeProgress: () => undefined,
				},
				elapsedMs: () => 500,
			},
			() => Promise.resolve(responses.shift() ?? ""),
		);

		expect(recorded).toEqual([
			{ kind: "turn-completed", spentUsd: 0.3, elapsedMs: 500 },
			{ kind: "turn-completed", spentUsd: 0.4, elapsedMs: 500 },
		]);
	});

	it("streams the stage call under a silence limit alone and reads the result line its runner returns", async () => {
		const calls: {
			readonly command: readonly string[];
			readonly options: object;
		}[] = [];
		const productOwner: ProductOwner = {
			ask: () => Promise.resolve("Use the small scope"),
			snapshot: () => ({
				sessionId: "po-session",
				spentUsd: 0,
				providerCalls: [],
			}),
		};

		const transcript = await runWorkflowStage(
			{
				targetDir: "/target",
				model: "sonnet",
				effort: undefined,
				sessionBudgetUsd: 5,
				spendCeiling: createSpendCeiling({ ceilingUsd: 100 }),
				productOwner,
				taskId: "ACT-347",
				stage: "build",
				skill: "build",
			},
			(command, _directory, options) => {
				calls.push({ command, options });

				return Promise.resolve(
					JSON.stringify({
						type: "result",
						session_id: "worker-session",
						total_cost_usd: 0.4,
						structured_output: { status: "COMPLETE", message: "Built" },
					}),
				);
			},
		);

		const [call] = calls;
		const format = call?.command.indexOf("--output-format") ?? -1;
		expect(call?.command.slice(format, format + 4)).toEqual([
			"--output-format",
			"stream-json",
			"--verbose",
			"--json-schema",
		]);
		expect(call?.options).toEqual({ silenceLimitMs: STAGE_SILENCE_LIMIT_MS });
		expect(transcript).toMatchObject({
			sessionId: "worker-session",
			costUsd: 0.4,
			exchanges: [{ agent: { status: "COMPLETE", message: "Built" } }],
		});
	});

	it("restricts a stage session to project-level settings when asked", async () => {
		const commands: string[][] = [];
		const productOwner: ProductOwner = {
			ask: () => Promise.resolve("Use the small scope"),
			snapshot: () => ({
				sessionId: "po-session",
				spentUsd: 0,
				providerCalls: [],
			}),
		};

		await runWorkflowStage(
			{
				targetDir: "/target",
				model: "sonnet",
				effort: undefined,
				sessionBudgetUsd: 5,
				spendCeiling: createSpendCeiling({ ceilingUsd: 100 }),
				productOwner,
				taskId: "ACT-28",
				stage: "shape",
				skill: "shape",
				settingSources: "project",
			},
			(command) => {
				commands.push([...command]);

				return Promise.resolve(
					JSON.stringify({
						type: "result",
						session_id: "worker-session",
						structured_output: { status: "COMPLETE", message: "Shaped" },
					}),
				);
			},
		);

		expect(commands[0]).toContain("--setting-sources");
	});

	it("leaves a stage session unrestricted by default", async () => {
		const commands: string[][] = [];
		const productOwner: ProductOwner = {
			ask: () => Promise.resolve("Use the small scope"),
			snapshot: () => ({
				sessionId: "po-session",
				spentUsd: 0,
				providerCalls: [],
			}),
		};

		await runWorkflowStage(
			{
				targetDir: "/target",
				model: "sonnet",
				effort: undefined,
				sessionBudgetUsd: 5,
				spendCeiling: createSpendCeiling({ ceilingUsd: 100 }),
				productOwner,
				taskId: "ACT-28",
				stage: "shape",
				skill: "shape",
			},
			(command) => {
				commands.push([...command]);

				return Promise.resolve(
					JSON.stringify({
						type: "result",
						session_id: "worker-session",
						structured_output: { status: "COMPLETE", message: "Shaped" },
					}),
				);
			},
		);

		expect(commands[0]).not.toContain("--setting-sources");
	});

	it("passes a declared settings overlay through to the session", async () => {
		const commands: string[][] = [];
		const productOwner: ProductOwner = {
			ask: () => Promise.resolve("Use the small scope"),
			snapshot: () => ({
				sessionId: "po-session",
				spentUsd: 0,
				providerCalls: [],
			}),
		};

		await runWorkflowStage(
			{
				targetDir: "/target",
				model: "sonnet",
				effort: undefined,
				sessionBudgetUsd: 5,
				spendCeiling: createSpendCeiling({ ceilingUsd: 100 }),
				productOwner,
				taskId: "ACT-28",
				stage: "shape",
				skill: "shape",
				settingsOverlay: '{"disableAllHooks":true}',
			},
			(command) => {
				commands.push([...command]);

				return Promise.resolve(
					JSON.stringify({
						type: "result",
						session_id: "worker-session",
						structured_output: { status: "COMPLETE", message: "Shaped" },
					}),
				);
			},
		);

		expect(commands[0]).toContain("--settings");
		expect(commands[0]?.[commands[0].indexOf("--settings") + 1]).toBe(
			'{"disableAllHooks":true}',
		);
	});

	it.each([
		{
			boundary: "invocation",
			laterResponse: new Error("worker invocation failed"),
		},
		{ boundary: "envelope decoding", laterResponse: "{" },
		{
			boundary: "structured output decoding",
			laterResponse: JSON.stringify({
				type: "result",
				session_id: "worker-session",
				structured_output: { status: "COMPLETE" },
			}),
		},
	])(
		"carries completed calls across $boundary failure",
		async ({ laterResponse }) => {
			const firstCall = {
				costUsd: 0.3,
				inputTokens: 60,
				outputTokens: 12,
				cacheReadTokens: 7,
				cacheWriteTokens: 8,
				turns: 2,
			};
			const responses: (string | Error)[] = [
				JSON.stringify({
					type: "result",
					session_id: "worker-session",
					total_cost_usd: firstCall.costUsd,
					num_turns: firstCall.turns,
					usage: {
						input_tokens: firstCall.inputTokens,
						output_tokens: firstCall.outputTokens,
						cache_read_input_tokens: firstCall.cacheReadTokens,
						cache_creation_input_tokens: firstCall.cacheWriteTokens,
					},
					structured_output: { status: "QUESTION", message: "Which scope?" },
				}),
				laterResponse,
			];
			const productOwner: ProductOwner = {
				ask: () => Promise.resolve("Use the small scope"),
				snapshot: () => ({
					sessionId: "po-session",
					spentUsd: 0,
					providerCalls: [],
				}),
			};

			const execution = runWorkflowStage(
				{
					targetDir: "/target",
					model: "sonnet",
					effort: undefined,
					sessionBudgetUsd: 5,
					spendCeiling: createSpendCeiling({ ceilingUsd: 100 }),
					productOwner,
					taskId: "ACT-22.1",
					stage: "shape",
					skill: "shape",
				},
				() => {
					const response = responses.shift();
					if (response instanceof Error) {
						return Promise.reject(response);
					}

					return Promise.resolve(response ?? "");
				},
			);

			let failure: unknown;
			try {
				await execution;
			} catch (error) {
				failure = error;
			}

			expect(failure).toBeInstanceOf(WorkflowExecutionError);
			expect(failure).toMatchObject({
				name: "WorkflowExecutionError",
				providerCalls: [{ metrics: firstCall }, {}],
			});
		},
	);

	it("does not classify budget exhaustion as a failed provider call", async () => {
		const responses = [
			JSON.stringify({
				type: "result",
				session_id: "worker-session",
				total_cost_usd: 5,
				structured_output: { status: "QUESTION", message: "Which scope?" },
			}),
		];
		const productOwner: ProductOwner = {
			ask: () => Promise.resolve("Use the small scope"),
			snapshot: () => ({
				sessionId: "po-session",
				spentUsd: 0,
				providerCalls: [],
			}),
		};

		let failure: unknown;
		try {
			await runWorkflowStage(
				{
					targetDir: "/target",
					model: "sonnet",
					effort: undefined,
					sessionBudgetUsd: 5,
					spendCeiling: createSpendCeiling({ ceilingUsd: 100 }),
					productOwner,
					taskId: "ACT-22.1",
					stage: "shape",
					skill: "shape",
				},
				() => Promise.resolve(responses.shift() ?? ""),
			);
		} catch (error) {
			failure = error;
		}

		expect(failure).not.toBeInstanceOf(WorkflowExecutionError);
		expect(failure).toMatchObject({
			message: "Claude session exhausted its budget",
		});
	});
	it("carries the underlying reason in the failure message", async () => {
		const productOwner: ProductOwner = {
			ask: () => Promise.resolve("Use the small scope"),
			snapshot: () => ({
				sessionId: "po-session",
				spentUsd: 0,
				providerCalls: [],
			}),
		};

		let failure: unknown;
		try {
			await runWorkflowStage(
				{
					targetDir: "/target",
					model: "sonnet",
					effort: undefined,
					sessionBudgetUsd: 5,
					spendCeiling: createSpendCeiling({ ceilingUsd: 100 }),
					productOwner,
					taskId: "ACT-22.1",
					stage: "build",
					skill: "build",
				},
				() => Promise.reject(new Error("claude exited with code 143")),
			);
		} catch (error) {
			failure = error;
		}

		expect(failure).toBeInstanceOf(WorkflowExecutionError);
		expect(failure).toMatchObject({
			message: "Worker execution failed: claude exited with code 143",
		});
	});
});

describe("the spend ceiling", () => {
	const idleProductOwner: ProductOwner = {
		ask: () => Promise.resolve("Use the small scope"),
		snapshot: () => ({
			sessionId: "po-session",
			spentUsd: 0,
			providerCalls: [],
		}),
	};

	function stageResult(totalCostUsd: number): string {
		return JSON.stringify({
			type: "result",
			session_id: "worker-session",
			total_cost_usd: totalCostUsd,
			structured_output: { status: "COMPLETE", message: "Shaped" },
		});
	}

	function answer(totalCostUsd: number): string {
		return JSON.stringify({
			session_id: "po-session",
			total_cost_usd: totalCostUsd,
			structured_output: { answer: "Use the small scope" },
		});
	}

	function budgetOf(command: readonly string[]): string | undefined {
		return command[command.indexOf("--max-budget-usd") + 1];
	}

	function stageRequest(spendCeiling: SpendCeiling): WorkflowStageRequest {
		return {
			targetDir: "/target",
			model: "sonnet",
			effort: undefined,
			sessionBudgetUsd: 5,
			spendCeiling,
			productOwner: idleProductOwner,
			taskId: "ACT-5",
			stage: "shape",
			skill: "shape",
		};
	}

	function productOwnerFor(
		spendCeiling: SpendCeiling,
		runClaude: ClaudeCommand,
	): ProductOwner {
		return createProductOwner(
			{
				directory: tmpdir(),
				model: "sonnet",
				sessionBudgetUsd: 5,
				spendCeiling,
				task: "Build it",
				productBrief: "Keep it small",
			},
			runClaude,
		);
	}

	it("starts a worker turn with no more budget than the ceiling left", async () => {
		const spendCeiling = createSpendCeiling({ ceilingUsd: 1 });
		spendCeiling.charge(0.6);
		const budgets: (string | undefined)[] = [];

		await runWorkflowStage(stageRequest(spendCeiling), (command) => {
			budgets.push(budgetOf(command));
			return Promise.resolve(stageResult(0.1));
		});

		expect(budgets).toEqual(["0.4"]);
	});

	it("charges the ceiling what each worker turn adds to the session", async () => {
		const spendCeiling = createSpendCeiling({ ceilingUsd: 10 });
		const responses = [
			JSON.stringify({
				type: "result",
				session_id: "worker-session",
				total_cost_usd: 0.3,
				structured_output: { status: "QUESTION", message: "Which scope?" },
			}),
			stageResult(0.5),
		];

		await runWorkflowStage(stageRequest(spendCeiling), () =>
			Promise.resolve(responses.shift() ?? ""),
		);

		expect(spendCeiling.spentUsd()).toBeCloseTo(0.5);
	});

	it("starts a Product Owner call with no more budget than the ceiling left", async () => {
		const spendCeiling = createSpendCeiling({ ceilingUsd: 1 });
		spendCeiling.charge(0.75);
		const budgets: (string | undefined)[] = [];
		const productOwner = productOwnerFor(spendCeiling, (command) => {
			budgets.push(budgetOf(command));
			return Promise.resolve(answer(0.1));
		});

		await productOwner.ask("shape", "Which scope?");

		expect(budgets).toEqual(["0.25"]);
	});

	it("charges the ceiling what each Product Owner call adds to its session", async () => {
		const spendCeiling = createSpendCeiling({ ceilingUsd: 10 });
		const responses = [answer(0.2), answer(0.5)];
		const productOwner = productOwnerFor(spendCeiling, () =>
			Promise.resolve(responses.shift() ?? ""),
		);

		await productOwner.ask("shape", "Which scope?");
		await productOwner.ask("shape", "Any constraints?");

		expect(spendCeiling.spentUsd()).toBeCloseTo(0.5);
	});

	function budgetHalt(costUsd: number): string {
		return JSON.stringify({
			type: "result",
			session_id: "halted-session",
			is_error: true,
			subtype: "error_max_budget_usd",
			terminal_reason: "budget_exhausted",
			total_cost_usd: costUsd,
		});
	}

	describe("when a paid call ends in an error", () => {
		it("charges the ceiling the worker turn's reported cost", async () => {
			const spendCeiling = createSpendCeiling({ ceilingUsd: 1 });

			await failureOf(
				runWorkflowStage(stageRequest(spendCeiling), () =>
					Promise.resolve(budgetHalt(0.4)),
				),
			);

			expect(spendCeiling.spentUsd()).toBeCloseTo(0.4);
		});

		it("charges the ceiling a resumed worker turn the CLI halted with a failed exit", async () => {
			const spendCeiling = createSpendCeiling({ ceilingUsd: 1 });
			const question = JSON.stringify({
				type: "result",
				session_id: "worker-session",
				total_cost_usd: 0.203,
				structured_output: { status: "QUESTION", message: "Which scope?" },
			});
			const halt = haltingCommand(await budgetHaltEnvelope());
			let turn = 0;

			await failureOf(
				runWorkflowStage(stageRequest(spendCeiling), () => {
					turn += 1;
					return turn === 1
						? Promise.resolve(question)
						: runStreamedSession(halt, process.cwd());
				}),
			);

			expect(spendCeiling.spentUsd()).toBeCloseTo(0.5782854);
		});

		it("charges the ceiling a worker turn whose answer is not a turn", async () => {
			const spendCeiling = createSpendCeiling({ ceilingUsd: 1 });

			await failureOf(
				runWorkflowStage(stageRequest(spendCeiling), () =>
					Promise.resolve(
						JSON.stringify({
							type: "result",
							session_id: "worker-session",
							total_cost_usd: 0.3,
							structured_output: { status: "UNKNOWN" },
						}),
					),
				),
			);

			expect(spendCeiling.spentUsd()).toBeCloseTo(0.3);
		});

		it("charges the ceiling the Product Owner call's reported cost", async () => {
			const spendCeiling = createSpendCeiling({ ceilingUsd: 1 });
			const productOwner = productOwnerFor(spendCeiling, () =>
				Promise.resolve(budgetHalt(0.25)),
			);

			await failureOf(productOwner.ask("shape", "Which scope?"));

			expect(spendCeiling.spentUsd()).toBeCloseTo(0.25);
		});

		it("charges the ceiling a Product Owner call the CLI halted with a failed exit", async () => {
			const spendCeiling = createSpendCeiling({ ceilingUsd: 1 });
			const halt = haltingCommand(await budgetHaltEnvelope());
			const productOwner = productOwnerFor(spendCeiling, () =>
				runJsonSession(halt, process.cwd()),
			);

			await failureOf(productOwner.ask("shape", "Which scope?"));

			expect(spendCeiling.spentUsd()).toBeCloseTo(0.5782854);
		});
	});

	describe("when the spend has reached the ceiling", () => {
		it("starts no worker turn", async () => {
			const spendCeiling = createSpendCeiling({ ceilingUsd: 1 });
			spendCeiling.charge(1);
			let calls = 0;

			const failure = await failureOf(
				runWorkflowStage(stageRequest(spendCeiling), () => {
					calls += 1;
					return Promise.resolve(stageResult(0.1));
				}),
			);

			expect(failure).toBeInstanceOf(SpendCeilingReachedError);
			expect(calls).toBe(0);
		});

		it("starts no Product Owner call", async () => {
			const spendCeiling = createSpendCeiling({ ceilingUsd: 1 });
			spendCeiling.charge(1);
			let calls = 0;
			const productOwner = productOwnerFor(spendCeiling, () => {
				calls += 1;
				return Promise.resolve(answer(0.1));
			});

			const failure = await failureOf(
				productOwner.ask("shape", "Which scope?"),
			);

			expect(failure).toBeInstanceOf(SpendCeilingReachedError);
			expect(calls).toBe(0);
		});
	});
});
