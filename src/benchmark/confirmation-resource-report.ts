import CALL_ROLES from "./confirmation-resource-contract";
import type {
	CallRole,
	ConfirmationCallEvidence,
	ConfirmationCommandTotal,
	ConfirmationResourceRep,
	ConfirmationResourceReport,
	MutableMetricDistributions,
} from "./confirmation-resource-contract";
import {
	appendMetricDistributions,
	emptyMetricDistributions,
	sortMetricDistributions,
	sumCallMetrics,
} from "./confirmation-resource-metrics";
import type { ClaudeCallMetrics } from "./contracts";

const NO_MISSING_METRIC_REPS = 0;

const EMPTY_OBSERVATION_TOTAL = 0;

const COMPLETE_REP_COUNT_INCREMENT = 1;
const NO_COMPLETE_REPS = 0;

const EMPTY_COLLECTION_LENGTH = 0;

class ResourceMeasurements {
	private readonly perRole = {
		"final-judge": emptyMetricDistributions(),
		"product-owner": emptyMetricDistributions(),
		"stage-judge": emptyMetricDistributions(),
		worker: emptyMetricDistributions(),
	} satisfies Record<CallRole, MutableMetricDistributions>;
	private total = emptyMetricDistributions();
	private readonly workerTurns: number[] = [];
	private readonly repElapsedMs: number[] = [];
	private readonly stageElapsedMs: Record<string, number[]> = {};
	private completeReps = NO_COMPLETE_REPS;
	public constructor(declaredStages: readonly string[]) {
		for (const stage of declaredStages) {
			this.stageElapsedMs[stage] = [];
		}
	}
	public observe(rep: ConfirmationResourceRep): void {
		if (rep.metrics.status !== "MISSING") {
			this.completeReps += COMPLETE_REP_COUNT_INCREMENT;
			this.recordCalls(rep.metrics.calls);
			this.recordElapsedTimes(rep);
		}
	}
	private recordCalls(calls: readonly ConfirmationCallEvidence[]): void {
		for (const role of CALL_ROLES) {
			this.perRole[role] = appendMetricDistributions(
				this.perRole[role],
				sumCallMetrics(calls, role),
			);
		}
		this.total = appendMetricDistributions(this.total, sumCallMetrics(calls));
	}
	private recordElapsedTimes(rep: ConfirmationResourceRep): void {
		this.workerTurns.push(rep.workerTrajectorySteps);
		this.repElapsedMs.push(rep.elapsedMs);

		for (const stage of rep.stages) {
			const durations = this.stageElapsedMs[stage.stage];
			if (durations !== undefined && stage.elapsedMs !== undefined) {
				durations.push(stage.elapsedMs);
			}
		}
	}
	public report(
		makespanMs: number,
		requested: number,
	): ConfirmationResourceReport {
		const sortedStageElapsedMs: Record<string, readonly number[]> = {};

		for (const [stage, durations] of Object.entries(this.stageElapsedMs)) {
			sortedStageElapsedMs[stage] = durations.toSorted(
				(left, right) => left - right,
			);
		}

		return {
			completeReps: this.completeReps,
			makespanMs,
			missingMetricReps: requested - this.completeReps,
			perRole: {
				"final-judge": sortMetricDistributions(this.perRole["final-judge"]),
				"product-owner": sortMetricDistributions(this.perRole["product-owner"]),
				"stage-judge": sortMetricDistributions(this.perRole["stage-judge"]),
				worker: sortMetricDistributions(this.perRole.worker),
			},
			repElapsedMs: this.repElapsedMs.toSorted((left, right) => left - right),
			stageElapsedMs: sortedStageElapsedMs,
			total: sortMetricDistributions(this.total),
			workerTurns: this.workerTurns.toSorted((left, right) => left - right),
		};
	}
}

function buildResourceReport(
	declaredStages: readonly string[],
	reps: readonly ConfirmationResourceRep[],
	makespanMs: number,
): ConfirmationResourceReport {
	const measurements = new ResourceMeasurements(declaredStages);

	for (const rep of reps) {
		measurements.observe(rep);
	}

	return measurements.report(makespanMs, reps.length);
}

function sumMetricValues(values: readonly number[]): number {
	return values.reduce(
		(total, value) => total + value,
		EMPTY_OBSERVATION_TOTAL,
	);
}

function buildSessionCommandTotal(
	report: ConfirmationResourceReport,
	preflight:
		| { readonly status: "COMPLETE"; readonly metrics: ClaudeCallMetrics }
		| { readonly status: "MISSING"; readonly missing: string },
): ConfirmationCommandTotal {
	const missing = [
		...(preflight.status === "MISSING" ? [preflight.missing] : []),
		...(report.missingMetricReps === NO_MISSING_METRIC_REPS
			? []
			: [`${String(report.missingMetricReps)} rep call metrics`]),
	];
	if (missing.length > EMPTY_COLLECTION_LENGTH) {
		return { missing, status: "MISSING" };
	}

	if (preflight.status === "MISSING") {
		throw new Error("Complete session total requires preflight metrics");
	}

	return {
		metrics: {
			cacheReadTokens:
				preflight.metrics.cacheReadTokens +
				sumMetricValues(report.total.cacheReadTokens),
			cacheWriteTokens:
				preflight.metrics.cacheWriteTokens +
				sumMetricValues(report.total.cacheWriteTokens),
			costUsd:
				preflight.metrics.costUsd + sumMetricValues(report.total.costUsd),
			inputTokens:
				preflight.metrics.inputTokens +
				sumMetricValues(report.total.inputTokens),
			outputTokens:
				preflight.metrics.outputTokens +
				sumMetricValues(report.total.outputTokens),
		},
		status: "COMPLETE",
	};
}

export { buildResourceReport, buildSessionCommandTotal };
