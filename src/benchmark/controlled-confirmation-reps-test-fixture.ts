import type { ConfirmationPlan, ConfirmationRepPlan } from "./confirmation";

const ORDINAL_BASE = 1;
interface FrozenConfirmationInputs {
	readonly corpus: string;
	readonly effort: string;
	readonly lineage: string;
	readonly model: string;
	readonly rubric: string;
}
class ControlledConfirmationReps {
	public readonly inputs: FrozenConfirmationInputs;
	public readonly started: ConfirmationRepPlan<FrozenConfirmationInputs>[] = [];
	readonly #releases: PromiseWithResolvers<string>[] = [];
	public constructor(values: Partial<FrozenConfirmationInputs> = {}) {
		this.inputs = Object.freeze({
			corpus: "frozen corpus",
			effort: "high",
			lineage: "checkpoint-1",
			model: "sonnet",
			rubric: "frozen rubric",
			...values,
		});
	}
	public plan(): ConfirmationPlan<FrozenConfirmationInputs> {
		return {
			frozenInputs: this.inputs,
			groupId: "confirmation-1",
			reps: 3,
			worktreePath: (repId) => `/worktrees/${repId}`,
		};
	}
	public readonly execute = async (
		plan: ConfirmationRepPlan<FrozenConfirmationInputs>,
	): Promise<string> => {
		const release = Promise.withResolvers<string>();
		this.started.push(plan);
		this.#releases.push(release);
		return await release.promise;
	};
	public releaseAll(): void {
		for (const [index, release] of this.#releases.entries()) {
			release.resolve(`confirmation-1-rep-${index + ORDINAL_BASE}`);
		}
	}
}
export { ControlledConfirmationReps as default };
