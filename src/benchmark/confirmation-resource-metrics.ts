import type {
	CallRole,
	ConfirmationCallEvidence,
	MetricDistributions,
	MutableMetricDistributions,
} from "./confirmation-resource-contract";
import type { ClaudeCallMetrics } from "./contracts";

function emptyMetricDistributions(): MutableMetricDistributions {
	return {
		cacheReadTokens: [],
		cacheWriteTokens: [],
		costUsd: [],
		inputTokens: [],
		outputTokens: [],
	};
}

function sumCallMetrics(
	calls: readonly ConfirmationCallEvidence[],
	role?: CallRole,
): Omit<ClaudeCallMetrics, "turns" | "durationMs" | "apiDurationMs"> {
	const total = {
		cacheReadTokens: 0,
		cacheWriteTokens: 0,
		costUsd: 0,
		inputTokens: 0,
		outputTokens: 0,
	};
	for (const call of calls) {
		if (role === undefined || call.role === role) {
			total.costUsd += call.metrics.costUsd;
			total.inputTokens += call.metrics.inputTokens;
			total.outputTokens += call.metrics.outputTokens;
			total.cacheReadTokens += call.metrics.cacheReadTokens;
			total.cacheWriteTokens += call.metrics.cacheWriteTokens;
		}
	}

	return total;
}

function appendMetricDistributions(
	distributions: MetricDistributions,
	metrics: ReturnType<typeof sumCallMetrics>,
): MutableMetricDistributions {
	return {
		cacheReadTokens: [
			...distributions.cacheReadTokens,
			metrics.cacheReadTokens,
		],
		cacheWriteTokens: [
			...distributions.cacheWriteTokens,
			metrics.cacheWriteTokens,
		],
		costUsd: [...distributions.costUsd, metrics.costUsd],
		inputTokens: [...distributions.inputTokens, metrics.inputTokens],
		outputTokens: [...distributions.outputTokens, metrics.outputTokens],
	};
}

function sortMetricDistributions(
	distributions: MetricDistributions,
): MetricDistributions {
	return {
		cacheReadTokens: distributions.cacheReadTokens.toSorted(
			(left, right) => left - right,
		),
		cacheWriteTokens: distributions.cacheWriteTokens.toSorted(
			(left, right) => left - right,
		),
		costUsd: distributions.costUsd.toSorted((left, right) => left - right),
		inputTokens: distributions.inputTokens.toSorted(
			(left, right) => left - right,
		),
		outputTokens: distributions.outputTokens.toSorted(
			(left, right) => left - right,
		),
	};
}

export {
	emptyMetricDistributions,
	sumCallMetrics,
	appendMetricDistributions,
	sortMetricDistributions,
};
