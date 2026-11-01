import { collectCalibration } from "./calibration";
import type {
	CalibrationResult,
	GradedRunArtifact,
	StageScorecard,
} from "./contracts";
import { loadJudgeAgreementReport } from "./judge-agreement";
import type {
	JudgeAgreementCalibration,
	JudgeAgreementReport,
} from "./judge-agreement";
import type { PreparedRunExecution } from "./run-execution-context";
import type { FinalCalibrationInput } from "./run-review-completion";

class RunReview {
	private calibratedStageFailure = false;
	public get stageFailureCalibrated(): boolean {
		return this.calibratedStageFailure;
	}
	public constructor(private readonly request: PreparedRunExecution) {}
	public readonly calibrateStageFailure = async (
		scorecards: readonly StageScorecard[],
	): Promise<CalibrationResult | undefined> => {
		const { execution, prepared } = this.request;
		const { config, benchmarkCase } = execution.inputs;
		if (!config.pause) {
			return undefined;
		}
		const calibration = await collectCalibration({
			finalRubricPath: benchmarkCase.finalRubricPath,
			judgeEffort: config.judgeEffort,
			judgeModel: config.judgeModel,
			log: execution.output.log,
			originalInstructions: prepared.evidence.corpus.instructions,
			originalRubric: prepared.evidence.task.rubric,
			reportError: execution.output.reportError,
			reviewFile: execution.identity.files.reviewFile,
			rl: execution.interaction.rl,
			rubricsDirectory: benchmarkCase.rubricsDirectory,
			sessionBudgetUsd: config.sessionBudgetUsd,
			spendCeiling: execution.spendCeiling,
			stageEvidenceOrigin: "session",
			stageScorecards: scorecards,
			targetDir: execution.source.root,
		});
		this.calibratedStageFailure = true;
		return calibration;
	};
	public readonly collectCalibration = async (
		input: FinalCalibrationInput,
	): Promise<CalibrationResult> => {
		const { execution } = this.request;
		const { config } = execution.inputs;
		return await collectCalibration({
			...input,
			judgeEffort: config.judgeEffort,
			judgeModel: config.judgeModel,
			log: execution.output.log,
			reportError: execution.output.reportError,
			reviewFile: execution.identity.files.reviewFile,
			rl: execution.interaction.rl,
			sessionBudgetUsd: config.sessionBudgetUsd,
			spendCeiling: execution.spendCeiling,
			stageEvidenceOrigin: "session",
			targetDir: execution.source.root,
		});
	};
	public readonly collectJudgeAgreement = async (
		currentCalibrations: readonly JudgeAgreementCalibration[],
	): Promise<JudgeAgreementReport> =>
		await loadJudgeAgreementReport(
			this.request.execution.identity.files.runsDirectory,
			currentCalibrations,
		);
	public async collectFinalAgreement(
		artifact: GradedRunArtifact,
		calibration: CalibrationResult,
	): Promise<JudgeAgreementReport> {
		return await this.collectJudgeAgreement([
			{
				final: {
					grade: artifact.grade,
					judgeContractSha256: artifact.judgeContractSha256,
					rubric: artifact.rubric,
				},
				humanReview: calibration.humanReview,
				judgeModel: this.request.execution.inputs.config.judgeModel,
				stages: artifact.stageScorecards,
			},
		]);
	}
}
export { RunReview as default };
