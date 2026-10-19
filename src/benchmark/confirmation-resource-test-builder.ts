import type { ConfirmationResourceRep } from "./confirmation-report";
import type { ClaudeCallMetrics, Immutable } from "./contracts";

const CACHE_READ_TOKEN_OFFSET = 2;
const CACHE_WRITE_TOKEN_OFFSET = 3;
const OUTPUT_TOKEN_OFFSET = 1;
interface MetricFixtureInput {
	readonly costUsd: number;
	readonly tokens: number;
	readonly turns: number;
}
const metric = ({
	costUsd,
	tokens,
	turns,
}: MetricFixtureInput): ClaudeCallMetrics => ({
	cacheReadTokens: tokens + CACHE_READ_TOKEN_OFFSET,
	cacheWriteTokens: tokens + CACHE_WRITE_TOKEN_OFFSET,
	costUsd,
	inputTokens: tokens,
	outputTokens: tokens + OUTPUT_TOKEN_OFFSET,
	turns,
});

class ConfirmationResourceRepBuilder {
	readonly #values: Immutable<Partial<ConfirmationResourceRep>>;
	public constructor(values: Immutable<Partial<ConfirmationResourceRep>> = {}) {
		this.#values = values;
	}
	public build(): Immutable<ConfirmationResourceRep> {
		return {
			elapsedMs: 40,
			metrics: {
				calls: [
					{
						metrics: metric({ costUsd: 1, tokens: 10, turns: 2 }),
						role: "worker",
					},
					{
						metrics: metric({ costUsd: 0.5, tokens: 5, turns: 1 }),
						role: "stage-judge",
					},
					{
						metrics: metric({ costUsd: 0.25, tokens: 3, turns: 1 }),
						role: "product-owner",
					},
				],
				status: "COMPLETE",
			},
			stages: [
				{ elapsedMs: 10, stage: "shape" },
				{ elapsedMs: 20, stage: "build" },
			],
			workerTrajectorySteps: 2,
			...this.#values,
		};
	}
	public planningOnlyRep(): ConfirmationResourceRepBuilder {
		return new ConfirmationResourceRepBuilder({
			...this.#values,
			elapsedMs: 50,
			metrics: {
				calls: [
					{
						metrics: metric({ costUsd: 2, tokens: 20, turns: 4 }),
						role: "worker",
					},
					{
						metrics: metric({ costUsd: 1, tokens: 10, turns: 1 }),
						role: "stage-judge",
					},
					{
						metrics: metric({ costUsd: 1.5, tokens: 15, turns: 1 }),
						role: "final-judge",
					},
				],
				status: "COMPLETE",
			},
			stages: [{ elapsedMs: 12, stage: "shape" }],
			workerTrajectorySteps: 4,
		});
	}
	public missingWorkerMetricsRep(): ConfirmationResourceRepBuilder {
		return new ConfirmationResourceRepBuilder({
			...this.#values,
			elapsedMs: 5,
			metrics: {
				calls: [],
				missing: ["worker.inputTokens"],
				status: "MISSING",
			},
			stages: [],
			workerTrajectorySteps: 0,
		});
	}
}
export { ConfirmationResourceRepBuilder as default };
