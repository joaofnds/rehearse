import { describe, expect, it } from "bun:test";
import type { ProductOwner } from "./workflow";
import {
	createProductOwner,
	runWorkflowStage,
	WorkflowExecutionError,
} from "./workflow";

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
				directory: "/target",
				model: "sonnet",
				sessionBudgetUsd: 5,
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
				directory: "/target",
				model: "sonnet",
				sessionBudgetUsd: 5,
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
				directory: "/target",
				model: "sonnet",
				sessionBudgetUsd: 5,
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
				session_id: "worker-session",
				total_cost_usd: 0.3,
				structured_output: { status: "QUESTION", message: "Which scope?" },
			}),
			JSON.stringify({
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
				productOwner,
				taskId: "ACT-5",
				stage: "shape",
				skill: "shape",
				runEvents: {
					record: (kind, _stage, spentUsd, elapsedMs) => {
						recorded.push({ kind, spentUsd, elapsedMs });
					},
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
				productOwner,
				taskId: "ACT-28",
				stage: "shape",
				skill: "shape",
			},
			(command) => {
				commands.push([...command]);

				return Promise.resolve(
					JSON.stringify({
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
