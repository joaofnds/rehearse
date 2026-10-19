import type { Effort, WorkflowStage } from "./config";
import type {
	ContextFile,
	JudgeGrade,
	LocalCheckResult,
	StageRubric,
	StageScorecard,
} from "./contracts";
import type { CorpusSourceResolver } from "./corpus-source";
import type { JudgeResult } from "./judge";
import type { StageEvidenceOrigin } from "./judge-evidence";
import type { SpendCeiling } from "./spend-ceiling";
import type { runStageJudge } from "./stage-grading";

interface Questioner {
	readonly question: (prompt: string) => Promise<string>;
}

interface FinalCandidate {
	readonly originalGrade: JudgeGrade;
	readonly baselineContext: readonly ContextFile[];
	readonly diff: string;
	readonly changedPaths: readonly string[];
	readonly checkIntegrity: LocalCheckResult;
	readonly localChecks: LocalCheckResult;
}

interface CalibrationContext {
	readonly stageEvidenceOrigin?: StageEvidenceOrigin | undefined;
	readonly rl: Questioner;
	readonly reviewFile: string;
	readonly targetDir: string;
	readonly originalInstructions: string;
	readonly originalRubric: string;
	readonly finalRubricPath: string;
	readonly rubricsDirectory: string;
	readonly finalCandidate?: FinalCandidate | undefined;
	readonly stageScorecards: readonly StageScorecard[];
	readonly judgeModel: string;
	readonly judgeEffort?: Effort | undefined;
	readonly sessionBudgetUsd: number;
	readonly spendCeiling: SpendCeiling;
	readonly stageJudge?: typeof runStageJudge | undefined;
	readonly resolveCorpus?: CorpusSourceResolver | undefined;
	readonly log: (message: string) => void;
	readonly reportError: (message: string) => void | Promise<void>;
}

interface FrozenCalibrationEvidence {
	readonly instructions: string;
	readonly finalRubric: string;
	readonly finalCandidate?: FinalCandidate | undefined;
	readonly stageScorecards: readonly StageScorecard[];
}

interface CurrentCalibrationSources {
	readonly instructions: string;
	readonly finalRubric: string;
	readonly stageRubrics: ReadonlyMap<WorkflowStage, string>;
}

interface CalibrationJudges {
	readonly stageJudge: (
		scorecard: Readonly<StageScorecard>,
		source: {
			readonly rubricPath: string;
			readonly content: string;
			readonly rubric: StageRubric;
		},
	) => Promise<StageScorecard>;
	readonly finalJudge?:
		| ((
				rubric: string,
				candidate: Readonly<FinalCandidate>,
		  ) => Promise<JudgeResult>)
		| undefined;
	readonly log?: ((message: string) => void) | undefined;
}

interface CalibrationExecution {
	readonly judges: Readonly<CalibrationJudges>;
	readonly log: CalibrationJudges["log"];
}

interface StageCalibrationSource {
	readonly content: string;
	readonly rubric: StageRubric;
	readonly rubricPath: string;
}

export type {
	Questioner,
	FinalCandidate,
	CalibrationContext,
	FrozenCalibrationEvidence,
	CurrentCalibrationSources,
	CalibrationJudges,
	CalibrationExecution,
	StageCalibrationSource,
};
