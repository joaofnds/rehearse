const CITATION_FILE_COMPONENT_INDEX = 0;

const CITATION_PATH_COMPONENT_COUNT = 1;

type Immutable<Value> = Value extends readonly (infer Element)[]
	? readonly Immutable<Element>[]
	: Value extends object
		? keyof Value extends never
			? Value
			: { readonly [Key in keyof Value]: Immutable<Value[Key]> }
		: Value;

function unhandled(value: never, subject: string): never {
	throw new Error(`Unhandled ${subject}: ${JSON.stringify(value)}`);
}

class StageValidationError extends Error {
	public override name = "StageValidationError";
}

function citationMatchesPath(
	citation: string,
	availablePaths: readonly string[],
): boolean {
	for (const candidate of new Set([
		citation,
		citation.split("#", CITATION_PATH_COMPONENT_COUNT)[
			CITATION_FILE_COMPONENT_INDEX
		],
	])) {
		if (candidate !== undefined && candidate !== "") {
			try {
				const glob = new Bun.Glob(candidate);
				if (
					availablePaths.some(
						(path) =>
							path === candidate ||
							// A directory that contains supplied paths names them all.
							path.startsWith(`${candidate}/`) ||
							glob.match(path),
					)
				) {
					return true;
				}
			} catch {
				// A citation that is not a valid glob simply matches nothing.
			}
		}
	}

	return false;
}

export { unhandled, StageValidationError, citationMatchesPath };
export type { Immutable };
export {
	evidenceSchema,
	evidenceLocatorSchema,
	recordedStageEvidenceSchema,
	gradedHardBlockersSchema,
} from "./judge-evidence-contract";
export {
	stageTurnSchema,
	productAnswerSchema,
	contextFileSchema,
	localCheckResultSchema,
	stageJudgeInputSchema,
} from "./workflow-stage-contract";
export {
	stageLetterGradeSchema,
	stageRubricSchema,
} from "./stage-rubric-contract";
export {
	judgeGradeResponseSchema,
	judgeGradeSchema,
	stageJudgeResponseSchema,
	stageJudgeOutputSchema,
} from "./judge-grade-contract";
export { humanFindingSchema, humanReviewSchema } from "./human-review-contract";
export {
	claudeCallMetricsSchema,
	claudeEnvelopeSchema,
} from "./claude-envelope-contract";
export {
	judgeAttemptListSchema,
	stageGradeSchema,
	stageScorecardSchema,
} from "./stage-scorecard-contract";
export { default as claudeJsonSchema } from "./contract-json-schema";
export type { SchemaPropertyOrder } from "./contract-json-schema";
export type {
	GradedHardBlockers,
	EvidenceLocator,
	RecordedStageEvidence,
} from "./judge-evidence-contract";
export type {
	JudgeGrade,
	JudgeGradeResponse,
	StageJudgeOutput,
	StageJudgeResponse,
} from "./judge-grade-contract";
export type { HumanReview } from "./human-review-contract";
export type {
	StageTurn,
	ContextFile,
	LocalCheckResult,
	StageExchange,
	ProviderCall,
	StageTranscript,
	StageJudgeInput,
} from "./workflow-stage-contract";
export type {
	ClaudeEnvelope,
	ClaudeCallMetrics,
	ClaudeModelUsage,
} from "./claude-envelope-contract";
export type { StageLetterGrade, StageRubric } from "./stage-rubric-contract";
export type {
	StageGrade,
	StageScorecard,
	StageJudgeRecord,
	CalibrationResult,
} from "./stage-judge-record-contract";
export type {
	RunArtifactEvidence,
	GradedRunArtifact,
	FailedJudgeRunArtifact,
	RunArtifact,
} from "./run-artifact-contract";

export type { SessionJudgeRecord } from "./session-judge-contract";
