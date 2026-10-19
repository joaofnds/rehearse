import type { ApprovalMethod, StageSkillPresence } from "./config";
import type { ConfirmationCostProjection } from "./confirmation";
import type { CorpusRoot } from "./corpus-file";
import type { ReplayRequest } from "./replay";

interface ReplayConfirmationRequest extends ReplayRequest {
	readonly groupId: string;
	readonly reps: number;
	readonly corpusRoots: readonly CorpusRoot[];
	readonly projectedCost: ConfirmationCostProjection;
	readonly approvalMethod: ApprovalMethod;
	/**
	 * Absent for a comparison's baseline arm, which replays the stage on a
	 * corpus without the stage's own skill.
	 */
	readonly stageSkill: StageSkillPresence;
	readonly now?: (() => number) | undefined;
	/** Epoch milliseconds a start time is read from; Date.now unless a test pins it. */
	readonly wallClock?: (() => number) | undefined;
}

interface ReplayConfirmationOutcome {
	readonly groupRecordFile: string;
	readonly reportFile: string;
	readonly repRecordFiles: readonly string[];
}

export type { ReplayConfirmationRequest, ReplayConfirmationOutcome };
