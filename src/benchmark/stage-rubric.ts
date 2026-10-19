import { join } from "node:path";

import { CONTROL_DIR } from "./config";
import type { StageRubric } from "./contracts";
import { stageRubricSchema } from "./contracts";
import type { StageDefinition, StageKind } from "./pipeline";

const EMPTY_COLLECTION_LENGTH = 0;

function parseStageRubric(
	content: string,
	kind: StageKind = "planning",
): StageRubric {
	const rubric = stageRubricSchema.parse(JSON.parse(content));
	const ids = [
		...rubric.hardBlockers,
		...rubric.requirements,
		...rubric.dimensions,
	].map(({ id }) => id);
	if (new Set(ids).size !== ids.length) {
		throw new Error("Stage rubric IDs must be unique");
	}
	const requiredHarnessBlockers =
		kind === "delivery"
			? ["invalid-stage-delivery", "false-test-safety", "unfinished-delivery"]
			: ["invalid-stage-delivery"];
	const missingHarnessBlockers = requiredHarnessBlockers.filter(
		(id) => !rubric.hardBlockers.some((blocker) => blocker.id === id),
	);
	if (missingHarnessBlockers.length > EMPTY_COLLECTION_LENGTH) {
		throw new Error(
			`Stage rubric must retain harness blockers: ${missingHarnessBlockers.join(", ")}`,
		);
	}

	return rubric;
}

async function loadStageRubric(stage: StageDefinition): Promise<{
	rubricPath: string;
	content: string;
	rubric: StageRubric;
}> {
	const rubricPath = join(CONTROL_DIR, stage.rubric);
	const content = await Bun.file(rubricPath).text();

	return {
		content,
		rubric: parseStageRubric(content, stage.kind),
		rubricPath,
	};
}

export { parseStageRubric, loadStageRubric };
