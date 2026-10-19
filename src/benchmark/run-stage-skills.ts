import { GLOBAL_SKILLS } from "./checkpoint";
import type { CorpusRoot } from "./corpus-file";
import type { StageContext } from "./run-stage-context";
import type { StageDependencies } from "./run-stage-contract";

async function resolveStageSkills(
	dependencies: StageDependencies,
	context: StageContext,
	corpusRoots: readonly CorpusRoot[],
): Promise<void> {
	await Array.fromAsync(
		[
			...GLOBAL_SKILLS,
			...context.pipeline.stages.map(({ skill: name }) => name),
		],
		async (skill) => {
			await dependencies.resolveSkillDirectory(skill, corpusRoots);
		},
	);
}

export { resolveStageSkills as default };
