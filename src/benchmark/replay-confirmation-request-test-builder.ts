import type { CorpusRoot } from "./corpus-file";
import type { ReplayConfirmationRequest } from "./replay-confirmation";
import type { BenchmarkRunPaths } from "./run-layout";

const DEFAULT_PER_REP_MAXIMUM_USD = 20;
const DEFAULT_CONFIRMATION_REPS = 3;
interface ReplayConfirmationInputs {
	readonly paths: BenchmarkRunPaths;
	readonly corpusRoots: readonly [CorpusRoot, ...CorpusRoot[]];
}
type ReplayConfirmationRequestOverride = Partial<
	Omit<ReplayConfirmationRequest, "paths" | "corpusRoots">
>;
class ReplayConfirmationRequestBuilder {
	readonly #overrides: ReplayConfirmationRequestOverride;
	public constructor(overrides: ReplayConfirmationRequestOverride = {}) {
		this.#overrides = overrides;
	}
	public build({
		paths,
		corpusRoots,
	}: ReplayConfirmationInputs): ReplayConfirmationRequest {
		const requestOverride = this.#overrides;
		const { reps = DEFAULT_CONFIRMATION_REPS } = requestOverride;

		return {
			approvalMethod: "yes",
			controlSha: "control-sha",
			corpusRoots,
			declaredTargetRoot: undefined,
			groupId: "confirmation-stage-1",
			instructions: "Frozen instructions\n",
			judgeModel: "opus",
			model: "sonnet",
			paths,
			projectedCost: {
				perRepMaximumUsd: DEFAULT_PER_REP_MAXIMUM_USD,
				reps,
				totalMaximumUsd: reps * DEFAULT_PER_REP_MAXIMUM_USD,
			},
			reps,
			sessionBudgetUsd: 5,
			setup: undefined,
			spendCeilingUsd: 100,
			stage: "discuss",
			stageSkill: "installed",
			...requestOverride,
		};
	}
}
export default ReplayConfirmationRequestBuilder;
export type { ReplayConfirmationInputs, ReplayConfirmationRequestOverride };
