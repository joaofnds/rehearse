import type { ClaudeCallMetrics, ClaudeEnvelope } from "./contracts";
import { claudeCallMetricsSchema } from "./contracts";

const BUDGET_DECIMAL_PLACES = 8;

/**
 * A provider spend measures in thousandths of a dollar, so it keeps every digit
 * the provider reported rather than rounding to cents like the rest of this
 * project's money: `$0.02` against a `$0.10` cap tells the operator nothing
 * about how close the cap is. Plain interpolation would render a
 * sub-microdollar spend as `$1e-7`, which is not an amount anyone can read.
 */
function spendUsd(costUsd: number): string {
	return costUsd
		.toFixed(BUDGET_DECIMAL_PLACES)
		.replace(/0+$/u, "")
		.replace(/\.$/u, "");
}

function readClaudeCallMetrics(
	envelope: ClaudeEnvelope,
): ClaudeCallMetrics | undefined {
	const metrics = claudeCallMetricsSchema.safeParse({
		apiDurationMs: envelope.duration_api_ms,
		cacheReadTokens: envelope.usage?.cache_read_input_tokens,
		cacheWriteTokens: envelope.usage?.cache_creation_input_tokens,
		costUsd: envelope.total_cost_usd,
		durationMs: envelope.duration_ms,
		inputTokens: envelope.usage?.input_tokens,
		modelUsage: envelope.modelUsage,
		outputTokens: envelope.usage?.output_tokens,
		turns: envelope.num_turns,
	});
	if (!metrics.success) {
		return undefined;
	}

	return withoutAbsentModelUsage(metrics.data);
}

/**
 * A key carrying `undefined` would serialize into a saved record as an empty
 * per-model block, which reads as a call that used no model rather than a CLI
 * that reported none.
 */
function withoutAbsentModelUsage(
	metrics: ClaudeCallMetrics,
): ClaudeCallMetrics {
	if (metrics.modelUsage !== undefined) {
		return metrics;
	}

	const rest = { ...metrics };
	delete rest.modelUsage;

	return rest;
}

export { spendUsd, readClaudeCallMetrics };
