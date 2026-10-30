import type { BaselineCorpus } from "./baseline-corpus";
import type { ComparisonBaselineRecord } from "./comparison-baseline-record";
import type { ComparisonArm } from "./comparison-record";
import type { Effort } from "./config";
import type { ConfirmationGroupRecord } from "./confirmation-record";
import type { Immutable } from "./contracts";
import type { MoreAttemptsCost } from "./more-attempts-cost";

interface ArmGroupRequest {
	readonly role: ComparisonArm;
	readonly withoutStageSkill: boolean;
	readonly run: string;
	readonly stage: string;
	readonly corpusDirectory: string;
	readonly reps: number;
	readonly model: string;
	readonly effort: Effort | undefined;
	readonly judgeModel: string;
	readonly judgeEffort: Effort | undefined;
	readonly sessionBudgetUsd: number;
}

interface CompareAttemptsRequest {
	readonly runsDirectory: string;
	readonly armA: string;
	readonly armB: string;
}

interface CompareAttemptsDependencies {
	/** Runs the baseline group and answers with its group id. */
	readonly runBaselineGroup: (request: ArmGroupRequest) => Promise<string>;
	/** Receives each line naming an arm that read a file under test live. */
	readonly notice?: ((line: string) => void) | undefined;
}

interface ExtendComparisonRequest {
	readonly runsDirectory: string;
	/** The manifest digest naming the comparison to extend. */
	readonly comparison: string;
	readonly attemptsPerArm: number;
}

interface ExtendComparisonDependencies {
	/** Stops the extension unless its stated cost is approved. */
	readonly approve: (cost: ExtensionPlan["cost"]) => Promise<void>;
	/** Runs one arm's added group and answers with its group id. */
	readonly runArmGroup: (request: ArmGroupRequest) => Promise<string>;
	/** Receives each line naming an arm that read a file under test live. */
	readonly notice?: ((line: string) => void) | undefined;
}

interface Checkpoint {
	readonly run: string;
	readonly stage: string;
}

interface RecordedArm {
	readonly group: Immutable<ConfirmationGroupRecord>;
	readonly checkpoint: Checkpoint;
	readonly corpusDigest: string;
	readonly corpus: ReadonlyMap<string, string>;
}

interface ComparisonPlan {
	readonly armA: RecordedArm;
	readonly baseline: Exclude<BaselineCorpus, { readonly kind: "refused" }>;
}

interface ExtensionPlan {
	readonly cost: Extract<MoreAttemptsCost, { readonly state: "available" }>;
	readonly record: ComparisonBaselineRecord;
	readonly armA: RecordedArm;
	readonly armB: RecordedArm;
}

type ArmGroups = ComparisonBaselineRecord["arms"];

export type {
	ArmGroupRequest,
	ArmGroups,
	Checkpoint,
	CompareAttemptsDependencies,
	CompareAttemptsRequest,
	ComparisonPlan,
	ExtendComparisonDependencies,
	ExtendComparisonRequest,
	ExtensionPlan,
	RecordedArm,
};
