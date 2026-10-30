import type {
	StageExecutionInputs,
	StageSessionEnvironment,
	StageSessionResult,
} from "./stage-session-contract";
import type { StageSessionDependencies } from "./stage-session-dependencies";
import StageSessionError from "./stage-session-error";
import { readJudgeReadyEvidence } from "./stage-session-judgment-input";
import type {
	JudgeReadyEvidence,
	StageJudgeEvidenceInputs,
} from "./stage-session-judgment-input";
import type { ServiceEnvironment } from "./target-services";
import { checksWithServices } from "./target-services";

/** Stage sessions and their treatment checks that reach the target's services. */
function stageSessionsWithServices<
	Dependencies extends StageSessionDependencies,
>(dependencies: Dependencies, environment: ServiceEnvironment): Dependencies {
	return {
		...dependencies,
		captureTreatmentChecks: async (targetDir, checks) =>
			await dependencies.captureTreatmentChecks(
				targetDir,
				checksWithServices(checks, environment),
			),
		runWorkflowStage: async (request) =>
			await dependencies.runWorkflowStage({
				...request,
				environment,
			}),
	};
}

/**
 * A stage's judge-ready evidence, read once its session ended. A failure to
 * read it fails the stage session, which spent what its transcript says.
 */
async function readSessionEvidence(
	dependencies: StageSessionDependencies,
	environment: StageSessionEnvironment,
	inputs: StageJudgeEvidenceInputs,
): Promise<JudgeReadyEvidence> {
	const { transcript } = inputs;
	try {
		return await readJudgeReadyEvidence(dependencies, environment, inputs);
	} catch (error) {
		throw new StageSessionError({
			cause: error,
			costUsd: transcript.costUsd,
			providerCalls: transcript.providerCalls,
			sessionId: transcript.sessionId,
		});
	}
}

/**
 * One stage session up to its judge-ready evidence: run the skill, read the
 * task state, and validate the stage's delivery. Shared by the run's stage
 * loop and by replay, which differ in what happens to the evidence, never in
 * how a stage produces it.
 */
async function executeStageSession(
	dependencies: StageSessionDependencies,
	environment: StageSessionEnvironment,
	{ definition, priorArtifacts }: StageExecutionInputs,
): Promise<StageSessionResult> {
	const stage = definition.name;
	const corpusFiles = await dependencies.captureStageCorpus(
		definition.skill,
		environment.instructions,
		environment.corpusRoots,
	);
	const corpusVersion = await dependencies.measureCorpus();
	const versionFiles = await dependencies.corpusVersionFiles(corpusVersion);
	const transcript = await dependencies.runWorkflowStage({
		effort: environment.effort,
		elapsedMs: environment.elapsedMs,
		model: environment.model,
		productOwner: environment.productOwner,
		runEvents: environment.runEvents,
		sessionBudgetUsd: environment.sessionBudgetUsd,
		sessionId: environment.sessionId,
		settingsOverlay: environment.settingsOverlay,
		setup: environment.setup,
		skill: definition.skill,
		spendCeiling: environment.spendCeiling,
		stage,
		targetDir: environment.targetDir,
		taskId: environment.taskId,
	});

	const evidence = await readSessionEvidence(dependencies, environment, {
		definition,
		priorArtifacts,
		transcript,
	});

	return { ...evidence, corpusFiles, corpusVersion, transcript, versionFiles };
}

export { stageSessionsWithServices, executeStageSession };
