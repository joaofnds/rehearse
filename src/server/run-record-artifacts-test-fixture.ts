import type { Immutable } from "#benchmark/contracts";
import { STOPPED_RUN_EVIDENCE } from "#benchmark/run-records-test-support";

import type { EarlierStage, WorkflowStateChange } from "./run-record";

class EarlierStageBuilder {
	public constructor(
		private readonly props: Immutable<Partial<EarlierStage>> = {},
	) {}

	public withWorkflowChanges(
		changes: readonly WorkflowStateChange[],
	): EarlierStageBuilder {
		return new EarlierStageBuilder({
			...this.props,
			artifactsOut: { workflowState: { changes, state: "available" } },
		});
	}

	public build(): EarlierStage {
		return {
			artifactsOut: { workflowState: { changes: [], state: "available" } },
			stage: "discuss",
			...this.props,
		};
	}
}

const { taskCard, untouchedCard, buildCommitSubjects, buildChangedPaths } =
	STOPPED_RUN_EVIDENCE;

const addedCard = ".boris/backlog/tasks/task-3 - Export-the-audit-log.md";

export {
	EarlierStageBuilder,
	taskCard,
	untouchedCard,
	buildCommitSubjects,
	buildChangedPaths,
	addedCard,
};
