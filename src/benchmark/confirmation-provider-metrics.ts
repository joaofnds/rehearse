import type { ConfirmationRepRecord } from "./confirmation-record";
import type { ClaudeCallMetrics, ProviderCall } from "./contracts";

const NO_WORKER_TURNS = 0;

const EMPTY_COLLECTION_LENGTH = 0;

type MetricRole = "worker" | "product-owner" | "stage-judge" | "final-judge";

interface ConfirmationProviderCalls {
	readonly worker: readonly ProviderCall[];
	readonly productOwner: readonly ProviderCall[] | undefined;
	readonly stageJudge: readonly ProviderCall[];
	readonly finalJudge: readonly ProviderCall[] | undefined;
}

interface RoleCalls {
	readonly role: MetricRole;
	readonly calls: readonly ProviderCall[];
}

interface CollectedCallEvidence {
	readonly calls: {
		readonly role: MetricRole;
		readonly metrics: ClaudeCallMetrics;
	}[];
	readonly missing: string[];
}
function workerTrajectorySteps(
	calls: readonly CollectedCallEvidence["calls"][number][],
): number {
	return calls
		.filter(({ role }) => role === "worker")
		.reduce((total, call) => total + call.metrics.turns, NO_WORKER_TURNS);
}

function collectConfirmationMetrics(
	providerCalls: ConfirmationProviderCalls,
): Pick<ConfirmationRepRecord, "metrics" | "workerTrajectorySteps"> {
	const required = initialRoleCalls(providerCalls);
	const evidence: CollectedCallEvidence = { calls: [], missing: [] };

	if (providerCalls.finalJudge !== undefined) {
		required.push({
			calls:
				providerCalls.finalJudge.length === EMPTY_COLLECTION_LENGTH
					? [{}]
					: providerCalls.finalJudge,
			role: "final-judge",
		});
	}

	for (const group of required) {
		for (const call of group.calls) {
			if (call.metrics === undefined) {
				evidence.missing.push(`${group.role} call metrics`);
			} else {
				evidence.calls.push({ metrics: call.metrics, role: group.role });
			}
		}
	}

	return {
		metrics:
			evidence.missing.length === EMPTY_COLLECTION_LENGTH
				? { calls: evidence.calls, status: "COMPLETE" }
				: {
						calls: evidence.calls,
						missing: evidence.missing,
						status: "MISSING",
					},
		workerTrajectorySteps: workerTrajectorySteps(evidence.calls),
	};
}

function initialRoleCalls(
	providerCalls: ConfirmationProviderCalls,
): RoleCalls[] {
	const required: RoleCalls[] = [
		{
			calls:
				providerCalls.worker.length === EMPTY_COLLECTION_LENGTH
					? [{}]
					: providerCalls.worker,
			role: "worker",
		},
		{
			calls: providerCalls.productOwner ?? [{}],
			role: "product-owner",
		},
		{
			calls:
				providerCalls.stageJudge.length === EMPTY_COLLECTION_LENGTH
					? [{}]
					: providerCalls.stageJudge,
			role: "stage-judge",
		},
	];

	return required;
}

export { collectConfirmationMetrics as default };
export type { ConfirmationProviderCalls };
