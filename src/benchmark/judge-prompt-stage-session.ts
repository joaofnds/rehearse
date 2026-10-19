import { captureCheckIntegrity, captureTreatmentChecks } from "./checks";
import type { PromptEvidence } from "./judge-prompt-evidence";
import {
	promptBuildState,
	promptCandidateState,
	promptChangedPaths,
	promptCorpusFiles,
	promptCorpusVersion,
	promptPlanningState,
	promptTaskCard,
	promptTaskOutput,
	readPromptFixture,
} from "./judge-prompt-fixtures";
import type { StageKind } from "./pipeline";
import { createSpendCeiling } from "./spend-ceiling";
import { executeStageSession } from "./stage-session";
import type {
	StageSessionEnvironment,
	StageSessionResult,
} from "./stage-session-contract";
import type { StageSessionDependencies } from "./stage-session-dependencies";
import { runWorkflowStage } from "./workflow";

const PLANNING_ARTIFACT_CONTEXT_INDEX = 0;

function promptSessionDependencies(
	evidence: PromptEvidence,
): StageSessionDependencies {
	return {
		assertBuildCommitted: promptBuildState,
		assertPlanningStageCompleted: async () => {
			const planning = await promptPlanningState();
			return {
				...planning,
				artifact: evidence.baselineContext[PLANNING_ARTIFACT_CONTEXT_INDEX],
			};
		},
		captureBuildCandidate: promptCandidateState,
		captureCheckIntegrity,
		captureStageCorpus: promptCorpusFiles,
		captureTreatmentChecks: async (targetDir, checks) =>
			await captureTreatmentChecks(targetDir, checks, (): void => undefined),
		changedPathsBetween: promptChangedPaths,
		corpusVersionFiles: promptCorpusFiles,
		measureCorpus: promptCorpusVersion,
		readTaskCard: promptTaskCard,
		readTaskOutput: promptTaskOutput,
		runWorkflowStage: async (request) =>
			await runWorkflowStage(
				request,
				async () => await readPromptFixture("worker-output.json"),
			),
	};
}

function promptSessionEnvironment(
	evidence: PromptEvidence,
): StageSessionEnvironment {
	return {
		baselineContext: evidence.baselineContext,
		baselineHashes: evidence.baselineHashes,
		baselineSha: "baseline",
		corpusRoots: [],
		instructions: "Instructions",
		model: "sonnet",
		productBrief: "Brief",
		productOwner: {
			ask: promptTaskCard,
			snapshot: () => ({
				providerCalls: [],
				sessionId: "po-session",
				spentUsd: 0,
			}),
		},
		sessionBudgetUsd: 5,
		sessionId: "worker-session",
		spendCeiling: createSpendCeiling({ ceilingUsd: 20 }),
		target: {
			checks: [{ command: ["true"] }],
			integrityFiles: ["context.md"],
		},
		targetDir: evidence.directory,
		task: "Task",
		taskId: "task-1",
		taskSha: "task",
	};
}

async function producePromptStageInput(
	evidence: PromptEvidence,
	kind: StageKind,
): Promise<StageSessionResult> {
	return await executeStageSession(
		promptSessionDependencies(evidence),
		promptSessionEnvironment(evidence),
		{
			definition: {
				kind,
				name: kind === "planning" ? "shape" : "build",
				requiresAcceptanceCriteria: false,
				rubric: "rubric.json",
				skill: kind === "planning" ? "shape" : "build",
			},
			priorArtifacts: evidence.baselineContext,
		},
	);
}

async function promptRubricContent(): Promise<string> {
	return await readPromptFixture("rubric.txt");
}

export { producePromptStageInput, promptRubricContent };
