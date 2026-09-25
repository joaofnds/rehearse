import { describe, expect, it } from "bun:test";
import {
	ClaudeSessionError,
	claudeArgs,
	readClaudeCallMetrics,
	readClaudeEnvelope,
	readStructuredOutput,
} from "./claude";
import type { ClaudeEnvelope } from "./contracts";
import {
	claudeJsonSchema,
	judgeGradeSchema,
	productAnswerSchema,
	stageTurnSchema,
} from "./contracts";

describe(readClaudeEnvelope.name, () => {
	it("returns the parsed session envelope", () => {
		const envelope = readClaudeEnvelope(
			JSON.stringify({ session_id: "session-1", total_cost_usd: 0.5 }),
		);

		expect(envelope.session_id).toBe("session-1");
		expect(envelope.total_cost_usd).toBe(0.5);
	});

	it("throws the session's own error message on an error envelope", () => {
		expect(() =>
			readClaudeEnvelope(
				JSON.stringify({
					session_id: "session-1",
					is_error: true,
					result: "session exhausted its budget",
				}),
			),
		).toThrow("session exhausted its budget");
	});

	it("carries the halt's reason and cost when the envelope states no result", () => {
		const read = (): ClaudeEnvelope =>
			readClaudeEnvelope(
				JSON.stringify({
					session_id: "session-1",
					is_error: true,
					terminal_reason: "budget_exhausted",
					total_cost_usd: 0.022268,
				}),
			);

		expect(read).toThrow("Claude session failed");
		expect(read).toThrow(ClaudeSessionError);
	});
});

describe(readClaudeCallMetrics.name, () => {
	it("maps complete provider usage without converting fields", () => {
		const envelope = readClaudeEnvelope(
			JSON.stringify({
				session_id: "session-1",
				total_cost_usd: 0.5,
				num_turns: 7,
				duration_ms: 1200,
				duration_api_ms: 900,
				usage: {
					input_tokens: 100,
					output_tokens: 20,
					cache_read_input_tokens: 30,
					cache_creation_input_tokens: 40,
				},
			}),
		);

		expect(readClaudeCallMetrics(envelope)).toEqual({
			costUsd: 0.5,
			inputTokens: 100,
			outputTokens: 20,
			cacheReadTokens: 30,
			cacheWriteTokens: 40,
			turns: 7,
			durationMs: 1200,
			apiDurationMs: 900,
		});
	});

	it("reads the metrics past usage fields the provider added", () => {
		const envelope = readClaudeEnvelope(
			JSON.stringify({
				session_id: "session-1",
				total_cost_usd: 0.5,
				num_turns: 7,
				duration_ms: 1200,
				duration_api_ms: 900,
				usage: {
					input_tokens: 100,
					output_tokens: 20,
					cache_read_input_tokens: 30,
					cache_creation_input_tokens: 40,
					output_tokens_details: { reasoning_tokens: 0 },
					server_tool_use: { web_search_requests: 0 },
					service_tier: "standard",
					cache_creation: { ephemeral_5m_input_tokens: 0 },
					inference_geo: "us",
					iterations: 1,
					speed: "fast",
				},
			}),
		);

		expect(readClaudeCallMetrics(envelope)?.inputTokens).toBe(100);
	});

	it("preserves missing required metrics as absence", () => {
		const envelope = readClaudeEnvelope(
			JSON.stringify({ session_id: "session-1", total_cost_usd: 0.5 }),
		);

		expect(readClaudeCallMetrics(envelope)).toBeUndefined();
	});
});

describe(readStructuredOutput.name, () => {
	it("reads the structured output field", () => {
		const envelope = readClaudeEnvelope(
			JSON.stringify({
				session_id: "session-1",
				structured_output: { answer: "ship it" },
			}),
		);

		const output = readStructuredOutput(envelope, productAnswerSchema);

		expect(output.answer).toBe("ship it");
	});

	it("parses the result text when structured output is absent", () => {
		const envelope = readClaudeEnvelope(
			JSON.stringify({
				session_id: "session-1",
				result: JSON.stringify({ answer: "ship it" }),
			}),
		);

		const output = readStructuredOutput(envelope, productAnswerSchema);

		expect(output.answer).toBe("ship it");
	});

	it("rejects an envelope with no output", () => {
		const envelope = readClaudeEnvelope(
			JSON.stringify({ session_id: "session-1" }),
		);

		expect(() => readStructuredOutput(envelope, productAnswerSchema)).toThrow(
			"did not contain structured output",
		);
	});
});

describe(claudeArgs.name, () => {
	it("grants a workflow session native customizations without permission prompts", () => {
		const command = claudeArgs({
			settings: { model: "sonnet", effort: "high", budgetUsd: 5 },
			schema: stageTurnSchema,
			access: "unrestricted",
			session: { id: "session-1", resume: false },
		});

		expect(command).toEqual([
			"claude",
			"-p",
			"--model",
			"sonnet",
			"--effort",
			"high",
			"--max-budget-usd",
			"5",
			"--output-format",
			"json",
			"--json-schema",
			claudeJsonSchema(stageTurnSchema),
			"--dangerously-skip-permissions",
			"--session-id",
			"session-1",
		]);
	});

	it("seals a judge session away from tools, skills, and persistence", () => {
		const command = claudeArgs({
			settings: { model: "sonnet", budgetUsd: 5 },
			schema: judgeGradeSchema,
			access: "sealed",
			systemPrompt: "You are a judge.",
		});

		expect(command).toEqual([
			"claude",
			"-p",
			"--safe-mode",
			"--disable-slash-commands",
			"--strict-mcp-config",
			"--model",
			"sonnet",
			"--max-budget-usd",
			"5",
			"--output-format",
			"json",
			"--json-schema",
			claudeJsonSchema(judgeGradeSchema),
			"--tools",
			"",
			"--system-prompt",
			"You are a judge.",
			"--no-session-persistence",
		]);
	});

	it("resumes an existing session", () => {
		const command = claudeArgs({
			settings: { model: "sonnet", budgetUsd: 5 },
			schema: stageTurnSchema,
			access: "unrestricted",
			session: { id: "session-1", resume: true },
		});

		expect(command).toContain("--resume");
		expect(command).not.toContain("--session-id");
	});

	it("restricts a stage session to project-level settings", () => {
		const command = claudeArgs({
			settings: { model: "sonnet", budgetUsd: 5 },
			schema: stageTurnSchema,
			access: "unrestricted",
			session: { id: "session-1", resume: false },
			settingSources: "project",
		});

		expect(command).toContain("--setting-sources");
		expect(command[command.indexOf("--setting-sources") + 1]).toBe("project");
	});

	it("omits --setting-sources when the invocation does not restrict sources", () => {
		const command = claudeArgs({
			settings: { model: "sonnet", budgetUsd: 5 },
			schema: stageTurnSchema,
			access: "unrestricted",
			session: { id: "session-1", resume: false },
		});

		expect(command).not.toContain("--setting-sources");
	});

	it("passes the declared settings JSON through --settings", () => {
		const command = claudeArgs({
			settings: { model: "sonnet", budgetUsd: 5 },
			schema: stageTurnSchema,
			access: "unrestricted",
			session: { id: "session-1", resume: false },
			settingsOverlay: '{"disableAllHooks":true}',
		});

		expect(command).toContain("--settings");
		expect(command[command.indexOf("--settings") + 1]).toBe(
			'{"disableAllHooks":true}',
		);
	});

	it("omits --settings when the invocation carries no settings overlay", () => {
		const command = claudeArgs({
			settings: { model: "sonnet", budgetUsd: 5 },
			schema: stageTurnSchema,
			access: "unrestricted",
			session: { id: "session-1", resume: false },
		});

		expect(command).not.toContain("--settings");
	});
});

describe("per-model usage", () => {
	it("retains the provider's per-model usage block", () => {
		const envelope = readClaudeEnvelope(
			JSON.stringify({
				session_id: "session-1",
				total_cost_usd: 0.029973,
				num_turns: 1,
				usage: {
					input_tokens: 2,
					output_tokens: 5,
					cache_read_input_tokens: 0,
					cache_creation_input_tokens: 14_973,
				},
				modelUsage: {
					"claude-haiku-4-5-20251001": {
						inputTokens: 2,
						outputTokens: 5,
						cacheReadInputTokens: 0,
						cacheCreationInputTokens: 14_973,
						costUSD: 0.029973,
						contextWindow: 200_000,
						maxOutputTokens: 32_000,
						canonicalModel: "claude-haiku-4-5",
						provider: "firstParty",
						costBasis: "list",
					},
				},
			}),
		);

		expect(readClaudeCallMetrics(envelope)?.modelUsage).toEqual({
			"claude-haiku-4-5-20251001": {
				inputTokens: 2,
				outputTokens: 5,
				cacheReadInputTokens: 0,
				cacheCreationInputTokens: 14_973,
				costUSD: 0.029973,
				contextWindow: 200_000,
				maxOutputTokens: 32_000,
				canonicalModel: "claude-haiku-4-5",
				provider: "firstParty",
				costBasis: "list",
			},
		});
	});

	it("reads the block past per-model fields the provider added", () => {
		const envelope = readClaudeEnvelope(
			JSON.stringify({
				session_id: "session-1",
				total_cost_usd: 0.07976,
				num_turns: 1,
				usage: {
					input_tokens: 2,
					output_tokens: 4,
					cache_read_input_tokens: 0,
					cache_creation_input_tokens: 19_929,
				},
				modelUsage: {
					"claude-sonnet-5": {
						inputTokens: 2,
						outputTokens: 4,
						cacheReadInputTokens: 0,
						cacheCreationInputTokens: 19_929,
						webSearchRequests: 0,
						costUSD: 0.07976,
						contextWindow: 1_000_000,
						maxOutputTokens: 64_000,
						thinkingTokens: 0,
						canonicalModel: "claude-sonnet-5",
						provider: "firstParty",
						costBasis: "list",
					},
				},
			}),
		);

		expect(
			readClaudeCallMetrics(envelope)?.modelUsage?.["claude-sonnet-5"],
		).toMatchObject({ webSearchRequests: 0, thinkingTokens: 0 });
	});

	it("retains one entry per model on a call that used more than one", () => {
		const envelope = readClaudeEnvelope(
			JSON.stringify({
				session_id: "session-1",
				total_cost_usd: 0.1,
				num_turns: 2,
				usage: {
					input_tokens: 4,
					output_tokens: 9,
					cache_read_input_tokens: 0,
					cache_creation_input_tokens: 100,
				},
				modelUsage: {
					"claude-haiku-4-5-20251001": {
						inputTokens: 2,
						outputTokens: 5,
						cacheReadInputTokens: 0,
						cacheCreationInputTokens: 40,
						costUSD: 0.02,
						contextWindow: 200_000,
						maxOutputTokens: 32_000,
						canonicalModel: "claude-haiku-4-5",
						provider: "firstParty",
						costBasis: "list",
					},
					"claude-sonnet-5": {
						inputTokens: 2,
						outputTokens: 4,
						cacheReadInputTokens: 0,
						cacheCreationInputTokens: 60,
						costUSD: 0.08,
						contextWindow: 1_000_000,
						maxOutputTokens: 64_000,
						canonicalModel: "claude-sonnet-5",
						provider: "firstParty",
						costBasis: "list",
					},
				},
			}),
		);

		const modelUsage = readClaudeCallMetrics(envelope)?.modelUsage;

		expect(Object.keys(modelUsage ?? {})).toEqual([
			"claude-haiku-4-5-20251001",
			"claude-sonnet-5",
		]);
		expect(modelUsage?.["claude-haiku-4-5-20251001"]?.costUSD).toBe(0.02);
		expect(modelUsage?.["claude-sonnet-5"]?.costUSD).toBe(0.08);
	});

	it("survives a per-model block the provider reports with a zero window", () => {
		const envelope = readClaudeEnvelope(
			JSON.stringify({
				session_id: "session-1",
				total_cost_usd: 0.5,
				num_turns: 1,
				usage: {
					input_tokens: 2,
					output_tokens: 4,
					cache_read_input_tokens: 0,
					cache_creation_input_tokens: 10,
				},
				modelUsage: {
					"unknown-model": {
						inputTokens: 2,
						outputTokens: 4,
						cacheReadInputTokens: 0,
						cacheCreationInputTokens: 10,
						costUSD: 0.5,
						contextWindow: 0,
						maxOutputTokens: 0,
						canonicalModel: "unknown-model",
						provider: "firstParty",
						costBasis: "list",
					},
				},
			}),
		);

		expect(
			readClaudeCallMetrics(envelope)?.modelUsage?.["unknown-model"]
				?.contextWindow,
		).toBe(0);
	});

	it("survives a sub-agent's per-model block without canonical model, provider or cost basis", () => {
		const envelope = readClaudeEnvelope(
			JSON.stringify({
				session_id: "session-1",
				total_cost_usd: 1,
				num_turns: 1,
				usage: {
					input_tokens: 2,
					output_tokens: 4,
					cache_read_input_tokens: 0,
					cache_creation_input_tokens: 10,
				},
				modelUsage: {
					"claude-opus-5-5[1m]": {
						inputTokens: 36,
						outputTokens: 24_590,
						cacheReadInputTokens: 614_679,
						cacheCreationInputTokens: 77_748,
						costUSD: 1,
						contextWindow: 1_000_000,
						maxOutputTokens: 128_000,
					},
				},
			}),
		);

		expect(
			readClaudeCallMetrics(envelope)?.modelUsage?.["claude-opus-5-5[1m]"]
				?.costUSD,
		).toBe(1);
	});

	it("preserves a missing per-model block as absence", () => {
		const envelope = readClaudeEnvelope(
			JSON.stringify({
				session_id: "session-1",
				total_cost_usd: 0.5,
				num_turns: 7,
				usage: {
					input_tokens: 100,
					output_tokens: 20,
					cache_read_input_tokens: 30,
					cache_creation_input_tokens: 40,
				},
			}),
		);

		const metrics = readClaudeCallMetrics(envelope);

		expect(metrics).toBeDefined();
		expect(metrics && "modelUsage" in metrics).toBe(false);
	});
});

describe(readStructuredOutput.name, () => {
	it("reads the structured output field", () => {
		const envelope = readClaudeEnvelope(
			JSON.stringify({
				session_id: "session-1",
				structured_output: { answer: "ship it" },
			}),
		);

		const output = readStructuredOutput(envelope, productAnswerSchema);

		expect(output.answer).toBe("ship it");
	});

	it("parses the result text when structured output is absent", () => {
		const envelope = readClaudeEnvelope(
			JSON.stringify({
				session_id: "session-1",
				result: JSON.stringify({ answer: "ship it" }),
			}),
		);

		const output = readStructuredOutput(envelope, productAnswerSchema);

		expect(output.answer).toBe("ship it");
	});

	it("rejects an envelope with no output", () => {
		const envelope = readClaudeEnvelope(
			JSON.stringify({ session_id: "session-1" }),
		);

		expect(() => readStructuredOutput(envelope, productAnswerSchema)).toThrow(
			"did not contain structured output",
		);
	});
});

describe(claudeArgs.name, () => {
	it("grants a workflow session native customizations without permission prompts", () => {
		const command = claudeArgs({
			settings: { model: "sonnet", effort: "high", budgetUsd: 5 },
			schema: stageTurnSchema,
			access: "unrestricted",
			session: { id: "session-1", resume: false },
		});

		expect(command).toEqual([
			"claude",
			"-p",
			"--model",
			"sonnet",
			"--effort",
			"high",
			"--max-budget-usd",
			"5",
			"--output-format",
			"json",
			"--json-schema",
			claudeJsonSchema(stageTurnSchema),
			"--dangerously-skip-permissions",
			"--session-id",
			"session-1",
		]);
	});

	it("seals a judge session away from tools, skills, and persistence", () => {
		const command = claudeArgs({
			settings: { model: "sonnet", budgetUsd: 5 },
			schema: judgeGradeSchema,
			access: "sealed",
			systemPrompt: "You are a judge.",
		});

		expect(command).toEqual([
			"claude",
			"-p",
			"--safe-mode",
			"--disable-slash-commands",
			"--strict-mcp-config",
			"--model",
			"sonnet",
			"--max-budget-usd",
			"5",
			"--output-format",
			"json",
			"--json-schema",
			claudeJsonSchema(judgeGradeSchema),
			"--tools",
			"",
			"--system-prompt",
			"You are a judge.",
			"--no-session-persistence",
		]);
	});

	it("resumes an existing session", () => {
		const command = claudeArgs({
			settings: { model: "sonnet", budgetUsd: 5 },
			schema: stageTurnSchema,
			access: "unrestricted",
			session: { id: "session-1", resume: true },
		});

		expect(command).toContain("--resume");
		expect(command).not.toContain("--session-id");
	});

	it("restricts a stage session to project-level settings", () => {
		const command = claudeArgs({
			settings: { model: "sonnet", budgetUsd: 5 },
			schema: stageTurnSchema,
			access: "unrestricted",
			session: { id: "session-1", resume: false },
			settingSources: "project",
		});

		expect(command).toContain("--setting-sources");
		expect(command[command.indexOf("--setting-sources") + 1]).toBe("project");
	});

	it("omits --setting-sources when the invocation does not restrict sources", () => {
		const command = claudeArgs({
			settings: { model: "sonnet", budgetUsd: 5 },
			schema: stageTurnSchema,
			access: "unrestricted",
			session: { id: "session-1", resume: false },
		});

		expect(command).not.toContain("--setting-sources");
	});

	it("passes the declared settings JSON through --settings", () => {
		const command = claudeArgs({
			settings: { model: "sonnet", budgetUsd: 5 },
			schema: stageTurnSchema,
			access: "unrestricted",
			session: { id: "session-1", resume: false },
			settingsOverlay: '{"disableAllHooks":true}',
		});

		expect(command).toContain("--settings");
		expect(command[command.indexOf("--settings") + 1]).toBe(
			'{"disableAllHooks":true}',
		);
	});

	it("omits --settings when the invocation carries no settings overlay", () => {
		const command = claudeArgs({
			settings: { model: "sonnet", budgetUsd: 5 },
			schema: stageTurnSchema,
			access: "unrestricted",
			session: { id: "session-1", resume: false },
		});

		expect(command).not.toContain("--settings");
	});
});

describe("per-model usage", () => {
	it("retains the provider's per-model usage block", () => {
		const envelope = readClaudeEnvelope(
			JSON.stringify({
				session_id: "session-1",
				total_cost_usd: 0.029973,
				num_turns: 1,
				usage: {
					input_tokens: 2,
					output_tokens: 5,
					cache_read_input_tokens: 0,
					cache_creation_input_tokens: 14_973,
				},
				modelUsage: {
					"claude-haiku-4-5-20251001": {
						inputTokens: 2,
						outputTokens: 5,
						cacheReadInputTokens: 0,
						cacheCreationInputTokens: 14_973,
						costUSD: 0.029973,
						contextWindow: 200_000,
						maxOutputTokens: 32_000,
						canonicalModel: "claude-haiku-4-5",
						provider: "firstParty",
						costBasis: "list",
					},
				},
			}),
		);

		expect(readClaudeCallMetrics(envelope)?.modelUsage).toEqual({
			"claude-haiku-4-5-20251001": {
				inputTokens: 2,
				outputTokens: 5,
				cacheReadInputTokens: 0,
				cacheCreationInputTokens: 14_973,
				costUSD: 0.029973,
				contextWindow: 200_000,
				maxOutputTokens: 32_000,
				canonicalModel: "claude-haiku-4-5",
				provider: "firstParty",
				costBasis: "list",
			},
		});
	});

	it("reads the block past per-model fields the provider added", () => {
		const envelope = readClaudeEnvelope(
			JSON.stringify({
				session_id: "session-1",
				total_cost_usd: 0.07976,
				num_turns: 1,
				usage: {
					input_tokens: 2,
					output_tokens: 4,
					cache_read_input_tokens: 0,
					cache_creation_input_tokens: 19_929,
				},
				modelUsage: {
					"claude-sonnet-5": {
						inputTokens: 2,
						outputTokens: 4,
						cacheReadInputTokens: 0,
						cacheCreationInputTokens: 19_929,
						webSearchRequests: 0,
						costUSD: 0.07976,
						contextWindow: 1_000_000,
						maxOutputTokens: 64_000,
						thinkingTokens: 0,
						canonicalModel: "claude-sonnet-5",
						provider: "firstParty",
						costBasis: "list",
					},
				},
			}),
		);

		expect(
			readClaudeCallMetrics(envelope)?.modelUsage?.["claude-sonnet-5"],
		).toMatchObject({ webSearchRequests: 0, thinkingTokens: 0 });
	});

	it("preserves a missing per-model block as absence", () => {
		const envelope = readClaudeEnvelope(
			JSON.stringify({
				session_id: "session-1",
				total_cost_usd: 0.5,
				num_turns: 7,
				usage: {
					input_tokens: 100,
					output_tokens: 20,
					cache_read_input_tokens: 30,
					cache_creation_input_tokens: 40,
				},
			}),
		);

		const metrics = readClaudeCallMetrics(envelope);

		expect(metrics).toBeDefined();
		expect(metrics && "modelUsage" in metrics).toBe(false);
	});
});
