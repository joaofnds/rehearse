import { stageRubricSha256 } from "./judge-agreement";
import type { ReadManifestEntry } from "./read-manifest";
import { loadStageRubric } from "./stage-rubric";
import { sha256Of } from "./staleness-test-files";

const SHA256_HEX_DIGITS = 64;

const PLANNING_RUBRIC = "cases/audit-log/rubrics/shape.json";

async function planningRubricNow(): Promise<string> {
	const loaded = await loadStageRubric({
		kind: "planning",
		name: "discuss",
		requiresAcceptanceCriteria: false,
		rubric: PLANNING_RUBRIC,
		skill: "discuss",
	});

	return stageRubricSha256(loaded.rubric);
}

const DELIVERY_RUBRIC = "cases/audit-log/rubrics/build.json";

async function deliveryRubricNow(): Promise<string> {
	const loaded = await loadStageRubric({
		kind: "delivery",
		name: "build",
		rubric: DELIVERY_RUBRIC,
		skill: "build",
	});

	return stageRubricSha256(loaded.rubric);
}

function deliveryRubricEntry(sha256: string): ReadManifestEntry {
	return {
		evidence: "declared",
		half: "rubric",
		path: DELIVERY_RUBRIC,
		role: "judge rubric",
		sha256,
	};
}

function discussManifest(rubricSha: string): readonly ReadManifestEntry[] {
	return [
		{
			evidence: "declared",
			half: "corpus",
			path: "CLAUDE.md",
			role: "global instructions",
			sha256: sha256Of("the instructions\n"),
		},
		{
			evidence: "declared and observed",
			half: "corpus",
			path: "skills/discuss/SKILL.md",
			role: "stage skill",
			sha256: sha256Of("discuss\n"),
		},
		{
			evidence: "declared",
			half: "rubric",
			path: PLANNING_RUBRIC,
			role: "judge rubric",
			sha256: rubricSha,
		},
		{
			evidence: "observed",
			half: "project",
			path: "CLAUDE.md",
			role: "project instructions",
			sha256: "d".repeat(SHA256_HEX_DIGITS),
		},
	];
}

function judgeRubricEntry(sha256: string): ReadManifestEntry {
	return {
		evidence: "declared",
		half: "rubric",
		path: PLANNING_RUBRIC,
		role: "judge rubric",
		sha256,
	};
}

export {
	PLANNING_RUBRIC,
	planningRubricNow,
	DELIVERY_RUBRIC,
	deliveryRubricNow,
	deliveryRubricEntry,
	discussManifest,
	judgeRubricEntry,
};
