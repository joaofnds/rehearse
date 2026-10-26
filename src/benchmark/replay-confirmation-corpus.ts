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
function frozenStageDefinitions({
	manifest,
	plan,
}: ReplayLineage): readonly StageDefinition[] {
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
async function captureFrozenReplayCorpus({
	request,
	lineage,
	corpusRoot,
}: ReplayCorpusInputs): Promise<void> {
	await Array.fromAsync(frozenStageDefinitions(lineage), async (definition) => {
		const snapshot =
			request.stageSkill === "absent" &&
			definition.skill === lineage.plan.definition.skill
				? snapshotStageCorpusWithoutSkill
				: snapshotStageCorpus;

		await snapshot(
			{ instructions: request.instructions, skill: definition.skill },
			request.corpusRoots,
			join(corpusRoot, definition.name),
		);
	});
}
export default captureFrozenReplayCorpus;
