import { join } from "node:path";

import {
	INITIAL_CHECKPOINT_STAGE,
	deriveStaleness,
	hashedCorpus,
	snapshotStageCorpus,
	snapshotStageCorpusWithoutSkill,
	withLoadedFilesNow,
} from "./checkpoint";
import type { CheckpointRecord, StageCorpus } from "./checkpoint";
import type { StageDefinition } from "./pipeline";
import type { ReplayConfirmationRequest } from "./replay-confirmation-contract";
import type { ReplayLineage } from "./replay-confirmation-inputs";
import { chainRubricCauses } from "./staleness-report";

interface ReplayCorpusInputs {
	readonly request: ReplayConfirmationRequest;
	readonly lineage: ReplayLineage;
	readonly corpusRoot: string;
}
class ReplayCorpusSnapshot {
	readonly #inputs: ReplayCorpusInputs;
	readonly #corpusByStage = new Map<string, StageCorpus>();
	readonly #chainCorpus = new Map<string, StageCorpus>();
	public constructor(inputs: ReplayCorpusInputs) {
		this.#inputs = inputs;
	}
	public async capture(): Promise<ReturnType<typeof deriveStaleness>> {
		const {
			request,
			lineage: { manifest, plan },
		} = this.#inputs;
		await Array.fromAsync(this.definitions(), async (definition) => {
			await this.captureStage(definition);
		});
		await Array.fromAsync(plan.chain, async (record) => {
			await this.loadChainCorpus(record);
		});

		return deriveStaleness(plan.chain, this.#chainCorpus, {
			effort: request.effort,
			judgeRubricCauses: await chainRubricCauses(
				plan.chain,
				manifest.pipeline.stages,
			),
			model: request.model,
			settingsFile: request.loadedSettings?.hashed,
		}).filter(({ stale }) => stale);
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
		if (this.#corpusByStage.has(definition.name)) {
			return;
		}

		const snapshot =
			request.stageSkill === "absent" &&
			definition.skill === plan.definition.skill
				? snapshotStageCorpusWithoutSkill
				: snapshotStageCorpus;
		const stageName = definition.name;
		const capturedCorpus = await snapshot(
			{ instructions: request.instructions, skill: definition.skill },
			request.corpusRoots,
			join(corpusRoot, definition.name),
		);
		this.#corpusByStage.set(stageName, hashedCorpus(capturedCorpus));
	}
	private async loadChainCorpus(
		record: Readonly<CheckpointRecord>,
	): Promise<void> {
		const { request } = this.#inputs;
		const corpus = this.#corpusByStage.get(record.stage);
		if (corpus !== undefined) {
			this.#chainCorpus.set(
				record.stage,
				await withLoadedFilesNow(corpus, record, request.corpusSource),
			);
		}
	}
}
async function captureFrozenReplayCorpus(
	inputs: ReplayCorpusInputs,
): Promise<ReturnType<typeof deriveStaleness>> {
	const snapshot = new ReplayCorpusSnapshot(inputs);
	return await snapshot.capture();
}
export default captureFrozenReplayCorpus;
