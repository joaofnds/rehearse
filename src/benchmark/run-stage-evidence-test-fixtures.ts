import { createHash } from "node:crypto";

import type { z } from "zod";

import type { HashedFile } from "./checkpoint";
import { stageRubricSha256 } from "./judge-agreement";
import type { ReadManifestEntry } from "./read-manifest";
import type { StageContext, runGradedStages } from "./run";
import type ControlledRunArtifactPersistence from "./run-artifact-persistence-test-fixture";
import { loadStageRubric } from "./stage-rubric";

async function readStageRecord<Value>(
	context: Pick<StageContext, "stageFile">,
	stage: string,
	schema: z.ZodType<Value>,
): Promise<Value> {
	const text = await Bun.file(context.stageFile(stage)).text();
	return schema.parse(JSON.parse(text));
}
type SavedCheckpoint = Awaited<
	ReturnType<typeof runGradedStages>
>["checkpoints"][number];
async function expectedCheckpointManifest(
	checkpoint: Readonly<SavedCheckpoint> | undefined,
	styleAtStart: Readonly<HashedFile>,
): Promise<readonly ReadManifestEntry[]> {
	const rubricNow = await loadStageRubric({
		kind: "planning",
		name: "shape",
		requiresAcceptanceCriteria: false,
		rubric: "cases/audit-log/rubrics/shape.json",
		skill: "shape",
	});
	return [
		{
			evidence: "declared",
			half: "corpus",
			path: "CLAUDE.md",
			role: "global instructions",
		},
		{
			evidence: "declared and observed",
			half: "corpus",
			path: "skills/shape/SKILL.md",
			role: "stage skill",
			sha256: checkpoint?.corpusFiles.find(
				({ path }) => path === "skills/shape/SKILL.md",
			)?.sha256,
		},
		{
			evidence: "declared",
			half: "rubric",
			path: "cases/audit-log/rubrics/shape.json",
			role: "judge rubric",
			sha256: stageRubricSha256(rubricNow.rubric),
		},
		{
			evidence: "observed",
			half: "corpus",
			path: "rulebook/style.md",
			role: "read for context",
			sha256: styleAtStart.sha256,
		},
	];
}
const PLANNING_SKILL_FILES = [
	{
		path: "skills/shape/SKILL.md",
		sha256: createHash("sha256").update("shape").digest("hex"),
	},
];
function readPersistedStageRecord<Value>(
	persistence: Pick<ControlledRunArtifactPersistence, "files">,
	stageFile: string,
	schema: z.ZodType<Value>,
): Value {
	const text = persistence.files.get(stageFile) ?? "";
	return schema.parse(JSON.parse(text));
}
export {
	readPersistedStageRecord,
	PLANNING_SKILL_FILES,
	readStageRecord,
	expectedCheckpointManifest,
};
