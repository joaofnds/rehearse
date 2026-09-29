import { describe, expect, it } from "bun:test";
import { failureOf } from "#cli/cli-test-support";
import {
	ClaudeSessionError,
	claudeArgs,
	readClaudeCallMetrics,
	readClaudeEnvelope,
	readStreamResult,
	readStructuredOutput,
	runJsonSession,
	runStreamedSession,
} from "./claude";
import { CommandError } from "./command";
import {
	claudeJsonSchema,
	judgeGradeSchema,
	productAnswerSchema,
	stageTurnSchema,
} from "./contracts";
import { budgetHaltEnvelope, haltingCommand } from "./test-support";

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

	it("throws the session's listed errors on an error envelope with no result", () => {
		expect(() =>
			readClaudeEnvelope(
				JSON.stringify({
					session_id: "session-1",
					is_error: true,
					subtype: "error_max_budget_usd",
					errors: ["Reached maximum budget ($0.2853308)"],
				}),
			),
		).toThrow("Reached maximum budget ($0.2853308)");
	});

	it("reads a halt's spend when its errors are not a list of messages", async () => {
		const output = JSON.stringify({
			session_id: "session-1",
			is_error: true,
			total_cost_usd: 0.1,
			errors: [{ code: 1 }],
		});

		const failure = await failureOf(
			Promise.resolve(output).then(readClaudeEnvelope),
		);

		expect(failure).toBeInstanceOf(ClaudeSessionError);
		expect(failure).toMatchObject({ costUsd: 0.1 });
	});

	it("throws the session's listed errors when the error envelope's result is empty", () => {
		expect(() =>
			readClaudeEnvelope(
				JSON.stringify({
					session_id: "session-1",
					is_error: true,
					result: "",
					errors: ["Reached maximum budget ($0.2853308)"],
				}),
			),
		).toThrow("Reached maximum budget ($0.2853308)");
	});

	it("carries the halt's reason and cost when the envelope states no result", async () => {
		const output = JSON.stringify({
			session_id: "session-1",
			is_error: true,
			terminal_reason: "budget_exhausted",
			total_cost_usd: 0.022268,
		});

		const failure = await failureOf(
			Promise.resolve(output).then(readClaudeEnvelope),
		);

		expect(failure).toBeInstanceOf(ClaudeSessionError);
		expect(failure).toMatchObject({
			message: "Claude session failed",
			terminalReason: "budget_exhausted",
			costUsd: 0.022268,
		});
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

	it("streams a session's output as it is written when asked to", () => {
		const command = claudeArgs({
			settings: { model: "sonnet", budgetUsd: 5 },
			schema: judgeGradeSchema,
			access: "sealed",
			output: "stream",
		});

		const format = command.indexOf("--output-format");
		expect(command.slice(format, format + 5)).toEqual([
			"--output-format",
			"stream-json",
			"--verbose",
			"--include-partial-messages",
			"--json-schema",
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

	it("keeps a call's metrics when a per-model block drops a field it used to carry", () => {
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
						maxOutputTokens: 128_000,
					},
				},
			}),
		);

		expect(readClaudeCallMetrics(envelope)).toEqual({
			costUsd: 1,
			inputTokens: 2,
			outputTokens: 4,
			cacheReadTokens: 0,
			cacheWriteTokens: 10,
			turns: 1,
		});
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

describe(readStreamResult.name, () => {
	it("returns the result line of a streamed session, the json envelope's shape", () => {
		const result = JSON.stringify({
			type: "result",
			total_cost_usd: 0.2,
			structured_output: { answer: "ship it" },
		});
		const output = [
			JSON.stringify({ type: "system", subtype: "init" }),
			JSON.stringify({ type: "stream_event", event: { type: "message_stop" } }),
			result,
			"",
		].join("\n");

		expect(readStreamResult(output)).toBe(result);
	});

	it("rejects a stream that ended without a result", () => {
		expect(() =>
			readStreamResult(JSON.stringify({ type: "system", subtype: "init" })),
		).toThrow("Claude stream ended without a result");
	});
});

describe(runStreamedSession.name, () => {
	const init = JSON.stringify({ type: "system", subtype: "init" });
	const partial = JSON.stringify({
		type: "stream_event",
		event: { type: "content_block_delta", index: 0 },
	});
	const result = JSON.stringify({ type: "result", is_error: true });
	const printing = (exitCode: number): string[] => [
		"sh",
		"-c",
		`printf '%s\\n' "$0" "$1" "$2"; exit ${exitCode}`,
		init,
		partial,
		result,
	];

	it("hands each line on and resolves to the result line", async () => {
		const lines: string[] = [];

		const output = await runStreamedSession(printing(0), process.cwd(), {
			onLine: (line) => {
				lines.push(line);
			},
		});

		expect(output).toBe(result);
		expect(lines.filter((line) => line !== "")).toEqual([
			init,
			partial,
			result,
		]);
	});

	it("reports a result line that is no session envelope as a command failure carrying that line alone", () => {
		const notAnEnvelope = JSON.stringify({ type: "result", is_error: true });

		expect(
			runStreamedSession(
				["sh", "-c", `printf '%s\\n' "$0" "$1"; exit 3`, init, notAnEnvelope],
				process.cwd(),
			),
		).rejects.toThrow(
			/^Command failed \(3\)[^\n]*\n\{"type":"result","is_error":true\}$/u,
		);
	});

	it("reports a session the CLI halted mid-stream as a session error naming its errors and spend", async () => {
		const halt = await budgetHaltEnvelope();

		const failure = await failureOf(
			runStreamedSession(
				[
					"sh",
					"-c",
					`printf '%s\\n' "$0" "$1" "$2"; exit 1`,
					init,
					partial,
					halt,
				],
				process.cwd(),
			),
		);

		expect(failure).toBeInstanceOf(ClaudeSessionError);
		expect(failure).toMatchObject({
			message: "Reached maximum budget ($0.2853308)",
			terminalReason: "budget_exhausted",
			costUsd: 0.5782854,
		});
	});
});

describe(runJsonSession.name, () => {
	it("reports a session the CLI halted as a session error carrying its spend", async () => {
		const halt = await budgetHaltEnvelope();

		const failure = await failureOf(
			runJsonSession(haltingCommand(halt), process.cwd()),
		);

		expect(failure).toBeInstanceOf(ClaudeSessionError);
		expect(failure).toMatchObject({
			terminalReason: "budget_exhausted",
			costUsd: 0.5782854,
		});
	});

	it("keeps the command's diagnostics when a halted session states no errors", async () => {
		const halt = JSON.stringify({
			session_id: "halted-session",
			is_error: true,
			total_cost_usd: 0.1,
		});

		const failure = await failureOf(
			runJsonSession(
				[
					"sh",
					"-c",
					`printf '%s' "$0"; echo "$1" >&2; exit 1`,
					halt,
					"socket closed",
				],
				process.cwd(),
			),
		);

		expect(failure).toBeInstanceOf(ClaudeSessionError);
		expect(failure.message).toContain("socket closed");
	});

	it("reports a failed command with no envelope as a command failure", () => {
		expect(
			runJsonSession(haltingCommand("claude: not logged in"), process.cwd()),
		).rejects.toBeInstanceOf(CommandError);
	});
});
