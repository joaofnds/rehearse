import { join } from "node:path";

import {
	INITIAL_CHECKPOINT_STAGE,
	snapshotStageCorpus,
	snapshotStageCorpusWithoutSkill,
} from "./checkpoint";
import type { StageDefinition } from "./pipeline";
import type { ReplayConfirmationRequest } from "./replay-confirmation-contract";
import type { ReplayLineage } from "./replay-confirmation-inputs";

interface ReplayCorpusInputs {
	readonly request: ReplayConfirmationRequest;
	readonly lineage: ReplayLineage;
	readonly corpusRoot: string;
}
class ReplayCorpusSnapshot {
	readonly #inputs: ReplayCorpusInputs;
	readonly #capturedStages = new Set<string>();
	public constructor(inputs: ReplayCorpusInputs) {
		this.#inputs = inputs;
	}
	public async capture(): Promise<void> {
		await Array.fromAsync(this.definitions(), async (definition) => {
			await this.captureStage(definition);
		});
	}
	private definitions(): readonly StageDefinition[] {
		const { manifest, plan } = this.#inputs.lineage;
		return [
			...plan.chain.flatMap((record) => {
				if (record.stage === INITIAL_CHECKPOINT_STAGE) {
					return [];
				}

				const definition = manifest.pipeline.stages.find(
					({ name }) => name === record.stage,
				);
				if (definition === undefined) {
					throw new Error(
						`The run's pipeline no longer declares the ${record.stage} stage its checkpoint records`,
					);
				}

				return [definition];
			}),
			plan.definition,
		];
	}
	private async captureStage(
		definition: Readonly<StageDefinition>,
	): Promise<void> {
		const {
			request,
			corpusRoot,
			lineage: { plan },
		} = this.#inputs;
		if (this.#capturedStages.has(definition.name)) {
			return;
		}

		const snapshot =
			request.stageSkill === "absent" &&
			definition.skill === plan.definition.skill
				? snapshotStageCorpusWithoutSkill
				: snapshotStageCorpus;

		await snapshot(
			{ instructions: request.instructions, skill: definition.skill },
			request.corpusRoots,
			join(corpusRoot, definition.name),
		);
		this.#capturedStages.add(definition.name);
	}
}
async function captureFrozenReplayCorpus(
	inputs: ReplayCorpusInputs,
): Promise<void> {
	const snapshot = new ReplayCorpusSnapshot(inputs);
	await snapshot.capture();
}
export default captureFrozenReplayCorpus;
