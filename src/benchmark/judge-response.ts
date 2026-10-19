import { readStructuredOutput } from "./claude";
import type {
	ClaudeEnvelope,
	ContextFile,
	JudgeGrade,
	LocalCheckResult,
} from "./contracts";
import { judgeGradeResponseSchema } from "./contracts";
import {
	locateJudgeEvidence,
	validateJudgeEvidence,
} from "./judge-evidence-location";
import validateJudgeGrade from "./judge-grade";
import { applyHarnessResults } from "./judge-harness";

interface JudgeCandidateEvidence {
	readonly baselineContext: readonly ContextFile[];
	readonly diff: string;
	readonly changedPaths: readonly string[];
	readonly checkIntegrity: LocalCheckResult;
	readonly localChecks: LocalCheckResult;
}

function readJudgeGrade(
	envelope: ClaudeEnvelope,
	rubricIds: readonly string[],
	{
		changedPaths,
		baselineContext,
		diff,
		checkIntegrity,
		localChecks,
	}: JudgeCandidateEvidence,
): JudgeGrade {
	const parsedGrade = validateJudgeGrade(
		readStructuredOutput(envelope, judgeGradeResponseSchema),
		rubricIds,
	);

	validateJudgeEvidence(
		parsedGrade,
		changedPaths,
		baselineContext.map(({ path }) => path),
	);

	return applyHarnessResults(
		locateJudgeEvidence(parsedGrade, diff, baselineContext),
		checkIntegrity,
		localChecks,
	);
}

export { readJudgeGrade as default };
export type { JudgeCandidateEvidence };
