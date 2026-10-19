import { parseTaskState } from "./backlog";
import type {
	ContextFile,
	StageJudgeInput,
	StageTranscript,
} from "./contracts";
import type { PlanningStageDefinition, StageDefinition } from "./pipeline";
import type { BuildEvidence } from "./run-artifact";
import { captureStageJudgeInput } from "./stage-grading";
import type {
	StageSessionEnvironment,
	StageSessionResult,
} from "./stage-session-contract";
import type { StageSessionDependencies } from "./stage-session-dependencies";

const EMPTY_COLLECTION_LENGTH = 0;

/** What a stage produced once its session returned, ready for its Judge. */
type JudgeReadyEvidence = Pick<
	StageSessionResult,
	"resultSha" | "input" | "artifact" | "buildEvidence"
>;

interface StageJudgeEvidenceInputs {
	readonly definition: StageDefinition;
	readonly priorArtifacts: readonly ContextFile[];
	readonly transcript: StageTranscript;
}

interface StageEvidenceCapture {
	readonly dependencies: StageSessionDependencies;
	readonly environment: StageSessionEnvironment;
	readonly definition: StageDefinition;
	readonly baseInput: StageJudgeInput;
	readonly currentTaskOutput: string;
	readonly taskCard: string;
}

class StageSessionEvidence {
	private artifact: ContextFile | undefined = undefined;
	private buildEvidence: BuildEvidence | undefined = undefined;
	private resultSha: string;
	public constructor(private readonly inputs: StageEvidenceCapture) {
		this.resultSha = inputs.environment.baselineSha;
	}
	public async capture(): Promise<JudgeReadyEvidence> {
		const { baseInput, definition } = this.inputs;
		const input = await captureStageJudgeInput(
			baseInput,
			async () =>
				await (definition.kind === "planning"
					? this.planningInput(definition)
					: this.deliveryInput()),
		);
		return {
			artifact: this.artifact,
			buildEvidence: this.buildEvidence,
			input,
			resultSha: this.resultSha,
		};
	}
	private async planningInput(
		definition: PlanningStageDefinition,
	): Promise<StageJudgeInput> {
		const { dependencies, environment, currentTaskOutput, baseInput } =
			this.inputs;

		const currentTask = parseTaskState(currentTaskOutput);

		const planning = await dependencies.assertPlanningStageCompleted(
			{
				baselineSha: environment.baselineSha,
				targetDir: environment.targetDir,
			},
			{ stage: definition, taskState: currentTask },
		);

		this.artifact = planning.artifact;
		this.resultSha = planning.resultSha;

		const planningInput: StageJudgeInput = {
			...baseInput,
			artifact: planning.artifact,
			changedPaths:
				planning.changedPaths.length > EMPTY_COLLECTION_LENGTH
					? planning.changedPaths
					: undefined,
			diff:
				planning.changedPaths.length > EMPTY_COLLECTION_LENGTH
					? planning.diff
					: undefined,
		};

		if (planning.commitSubjects !== undefined) {
			return {
				...planningInput,
				commitSubjects: planning.commitSubjects,
			};
		}

		return planningInput;
	}
	private async deliveryInput(): Promise<StageJudgeInput> {
		const { dependencies, environment, taskCard, baseInput } = this.inputs;

		const build = await dependencies.assertBuildCommitted(
			{ targetDir: environment.targetDir, taskSha: environment.baselineSha },
			"main",
			environment.commitSubjectPattern,
		);

		this.resultSha = build.resultSha;

		this.buildEvidence = {
			changedPaths: await dependencies.changedPathsBetween(
				environment.targetDir,
				environment.baselineSha,
				build.resultSha,
			),
			diff: build.diff,
			resultSha: build.resultSha,
			...(await measureDeliveryChecks(dependencies, environment)),
			taskState: taskCard,
		};

		return {
			...baseInput,
			changedPaths: this.buildEvidence.changedPaths,
			checkIntegrity: this.buildEvidence.checkIntegrity,
			commitSubjects: build.commitSubjects,
			diff: this.buildEvidence.diff,
			localChecks: this.buildEvidence.localChecks,
		};
	}
}

async function readJudgeReadyEvidence(
	dependencies: StageSessionDependencies,
	environment: StageSessionEnvironment,
	{ definition, priorArtifacts, transcript }: StageJudgeEvidenceInputs,
): Promise<JudgeReadyEvidence> {
	const stage = definition.name;

	const currentTaskOutput = await dependencies.readTaskOutput(
		environment.targetDir,
		environment.taskId,
	);

	const taskCard = await dependencies.readTaskCard(
		environment.targetDir,
		environment.taskId,
	);

	const buildCandidate =
		definition.kind === "delivery"
			? await dependencies.captureBuildCandidate(
					environment.targetDir,
					environment.taskSha,
				)
			: undefined;

	const baseInput: StageJudgeInput = {
		baselineContext: environment.baselineContext,
		changedPaths: buildCandidate?.changedPaths,
		diff: buildCandidate?.diff,
		instructions: environment.instructions,
		kind: definition.kind,
		priorArtifacts: [...priorArtifacts],
		productBrief: environment.productBrief,
		stage,
		task: environment.task,
		taskState: taskCard,
		transcript,
	};
	const evidence = new StageSessionEvidence({
		baseInput,
		currentTaskOutput,
		definition,
		dependencies,
		environment,
		taskCard,
	});
	return await evidence.capture();
}

async function measureDeliveryChecks(
	dependencies: StageSessionDependencies,
	environment: StageSessionEnvironment,
): Promise<Pick<BuildEvidence, "checkIntegrity" | "localChecks">> {
	return {
		checkIntegrity: await dependencies.captureCheckIntegrity(
			environment.targetDir,
			environment.baselineHashes,
		),
		localChecks: await dependencies.captureTreatmentChecks(
			environment.targetDir,
			environment.target.checks,
		),
	};
}

export { readJudgeReadyEvidence, measureDeliveryChecks };

export type { JudgeReadyEvidence };
