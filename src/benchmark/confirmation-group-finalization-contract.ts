import type { InheritedVariable } from "./claude-launch-environment";
import type { ApprovalMethod, Effort } from "./config";
import type { ConfirmationCostProjection } from "./confirmation";
import type { SessionConfirmationGroupRecord } from "./confirmation-record";
import type { ConfirmationRepResult } from "./confirmation-rep-settlement";
import type { CorpusDelivery } from "./corpus-delivery";
import type { CorpusMeasurement } from "./corpus-measurement";
import type { FrozenFile } from "./frozen-confirmation-files";

class GroupStoppedError extends Error {
	public override name = "GroupStoppedError";

	public constructor(groupId: string) {
		super(
			`Confirmation group ${groupId} was stopped by the operator, so no group record or report was written`,
		);
	}
}

interface ConfirmationGroupFinalizationBase {
	readonly caseId: string;
	readonly groupId: string;
	readonly reps: number;
	readonly declaredStages: readonly string[];
	readonly approvalMethod: ApprovalMethod;
	readonly repResults: readonly ConfirmationRepResult[];
	readonly worktreesDirectory: string;
	readonly groupDirectory: string;
	readonly runsDirectory: string;
	readonly groupFile: string;
	readonly operatorStopFile: string;
	readonly reportFile: string;
	/** The ISO instant the group's makespan starts, read from the wall clock. */
	readonly startedAt: string;
	readonly makespanMs: number;
}

type ConfirmationGroupLineage =
	| { readonly kind: "SOURCE"; readonly sha: string }
	| {
			readonly kind: "CHECKPOINT";
			readonly lineage: string;
			readonly targetSha: string;
	  };

interface ConfirmationGroupInputs {
	readonly lineage: ConfirmationGroupLineage;
	readonly files: readonly Readonly<FrozenFile>[];
	readonly model: string;
	readonly effort?: Effort | undefined;
	readonly judgeModel: string;
	readonly judgeEffort?: Effort | undefined;
	readonly sessionBudgetUsd: number;
	readonly spendCeilingUsd: number;
	readonly pipelinePath: string;
	readonly corpusVersion: CorpusMeasurement;
	/** How the stage installs delivered the group's corpus, read at freeze. */
	readonly corpusDelivery: CorpusDelivery;
	readonly setup: "actual";
	/** What the stages' Claude Code children inherited, read where they spawn. */
	readonly inheritedConfiguration: readonly InheritedVariable[];
}

interface SessionConfirmationGroupInputs {
	readonly lineage: { readonly kind: "SESSION"; readonly lineage: string };
	readonly files: readonly Readonly<FrozenFile>[];
	readonly model: string;
	readonly effort?: Effort | undefined;
	readonly sessionBudgetUsd: number;
	readonly spendCeilingUsd: number;
	readonly corpusVersion: CorpusMeasurement;
}

type ConfirmationGroupFinalization = ConfirmationGroupFinalizationBase &
	(
		| {
				readonly mode: "stage" | "pipeline";
				readonly inputs: ConfirmationGroupInputs;
				readonly projectedCost: ConfirmationCostProjection;
				readonly preflight?: never;
		  }
		| {
				readonly mode: "session";
				readonly inputs: SessionConfirmationGroupInputs;
				readonly projectedCost: ConfirmationCostProjection & {
					readonly preflightMaximumUsd: number;
				};
				readonly preflight: SessionConfirmationGroupRecord["preflight"];
		  }
	);

interface ConfirmationGroupOutcome {
	readonly groupRecordFile: string;
	readonly reportFile: string;
	readonly repRecordFiles: readonly string[];
}

export { GroupStoppedError as default };
export type { ConfirmationGroupFinalization, ConfirmationGroupOutcome };
