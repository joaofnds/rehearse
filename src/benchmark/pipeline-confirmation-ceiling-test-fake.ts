import type { PipelineConfirmationDependencies } from "./pipeline-confirmation";
import { repOrdinal } from "./pipeline-confirmation-workspace-test-fixture";

const BUDGETED_ATTEMPT_COUNT = 3;
const NO_RECORDED_DISCUSSION_COST_USD = 0;

class PipelineCeilingFake {
	public readonly started: string[] = [];
	private readonly allBudgeted = Promise.withResolvers<boolean>();
	private readonly budgeted = new Set<number>();
	private readonly discussCostUsd = new Map(
		[
			{ costUsd: 2.5, repOrdinal: 1 },
			{ costUsd: 0.6, repOrdinal: 2 },
			{ costUsd: 0, repOrdinal: 3 },
		].map(({ repOrdinal: ordinal, costUsd }) => [ordinal, costUsd]),
	);

	public readonly override = (
		dependencies: PipelineConfirmationDependencies,
	): PipelineConfirmationDependencies => {
		const { stageSession } = dependencies;
		const { runWorkflowStage } = stageSession;

		return {
			...dependencies,
			stageSession: {
				...stageSession,
				runWorkflowStage: async (request) => {
					const rep = repOrdinal(request.targetDir);
					request.spendCeiling.budgetFor(request.sessionBudgetUsd);
					this.started.push(`${String(rep)}-${request.stage}`);
					if (request.stage === "discuss") {
						this.budgeted.add(rep);
						if (this.budgeted.size === BUDGETED_ATTEMPT_COUNT) {
							this.allBudgeted.resolve(true);
						}

						await this.allBudgeted.promise;
						request.spendCeiling.charge(
							this.discussCostUsd.get(rep) ?? NO_RECORDED_DISCUSSION_COST_USD,
						);
					}

					return await runWorkflowStage(request);
				},
			},
		};
	};
}

export { PipelineCeilingFake as default };
