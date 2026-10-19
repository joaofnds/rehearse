import { z } from "zod";

import {
	RECORDED_READINGS,
	STOPPED_RUN_EVIDENCE,
} from "#benchmark/run-records-test-support";

const WORKER_COST_USD = 2;

const JUDGE_COST_USD = 1;

const LATER_WORKER_COST_USD = 3;

const LATER_JUDGE_COST_USD = 0.5;

const EMPTY_METRIC_TOTAL = 0;

function sumCallMetric(
	calls: readonly (typeof STOPPED_RUN_EVIDENCE.buildSessionMetrics)[],
	field: keyof typeof STOPPED_RUN_EVIDENCE.buildSessionMetrics,
): number {
	return calls.reduce(
		(total, call) => total + Number(call[field]),
		EMPTY_METRIC_TOTAL,
	);
}

const missingTokenPartSchema = z.object({ part: z.string() }).loose();

const tokenTotalsSchema = z.object({
	cacheRead: z.number(),
	cacheWrite: z.number(),
	input: z.number(),
	missing: z.array(missingTokenPartSchema),
	output: z.number(),
});

/** The served run's token totals, read to compare two runs. */
const runTokensSchema = z.object({
	totals: z.object({
		tokens: tokenTotalsSchema,
	}),
});

const costPartSchema = z.object({ part: z.string(), usd: z.number() });

const costTotalsSchema = z.object({ parts: z.array(costPartSchema) });

const runCostSchema = z.object({
	totals: z.object({ cost: costTotalsSchema }),
});

const {
	discussSessionMetrics,
	discussJudgeMetrics,
	buildSessionMetrics,
	buildJudgeAttemptMetrics,
	buildJudgeHaltedMetrics,
} = STOPPED_RUN_EVIDENCE;

const { stageElapsedMs, runElapsedMs, productOwnerMetrics } = RECORDED_READINGS;

export {
	WORKER_COST_USD,
	JUDGE_COST_USD,
	LATER_WORKER_COST_USD,
	LATER_JUDGE_COST_USD,
	sumCallMetric,
	runTokensSchema,
	runCostSchema,
	discussSessionMetrics,
	discussJudgeMetrics,
	buildSessionMetrics,
	buildJudgeAttemptMetrics,
	buildJudgeHaltedMetrics,
	stageElapsedMs,
	runElapsedMs,
	productOwnerMetrics,
	EMPTY_METRIC_TOTAL,
};
