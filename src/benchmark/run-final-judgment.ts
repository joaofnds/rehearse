import type { FailedJudgeRunArtifact, GradedRunArtifact } from "./contracts";
import type { JudgeResult } from "./judge";
import { runJudge } from "./judge";
import type { JudgeInvoker } from "./judge-attempt";
import {
	JudgeExecutionError,
	JudgeOutputValidationError,
} from "./judge-attempt";
import JudgeCeilingStopError from "./judge-ceiling-stop-error";
import type { CeilingStopReadings } from "./run-abort";
import { buildFailedJudgeRunArtifact, buildRunArtifact } from "./run-artifact";
import type { RunArtifactBaseInputs } from "./run-artifact";
import type { SpendCeiling, SpendCeilingReachedError } from "./spend-ceiling";

type JudgeFailure =
	| JudgeOutputValidationError
	| JudgeCeilingStopError
	| JudgeExecutionError;

interface PaidJudgeFailure {
	readonly failure: Readonly<JudgeFailure>;
	readonly ceilingStop: CeilingStopReadings | undefined;
}

/**
 * A Judge failure that still carries the attempts it paid for, with the
 * ceiling stop when the run's spend reached the ceiling. An execution
 * failure counts only at the ceiling, since its call was then halted at the
 * budget the ceiling had left.
 */
function paidJudgeFailure(
	error: Readonly<Error>,
	spendCeiling: SpendCeiling,
): PaidJudgeFailure | undefined {
	if (
		!(
			error instanceof JudgeOutputValidationError ||
			error instanceof JudgeCeilingStopError ||
			error instanceof JudgeExecutionError
		)
	) {
		return undefined;
	}
	const ceilingStop = ceilingReadings(
		error instanceof JudgeCeilingStopError ? error : undefined,
		spendCeiling,
	);
	if (error instanceof JudgeExecutionError && ceilingStop === undefined) {
		return undefined;
	}

	return { ceilingStop, failure: error };
}

interface FinalJudgeRequest {
	readonly artifactInputs: RunArtifactBaseInputs;
	readonly writeFailedArtifact: (
		artifact: FailedJudgeRunArtifact,
	) => Promise<void>;
	readonly invoke?: JudgeInvoker | undefined;
	readonly elapsedMs?: (() => number) | undefined;
	readonly spendCeiling: SpendCeiling;
}

async function runFinalJudge(request: FinalJudgeRequest): Promise<JudgeResult> {
	const { artifactInputs: inputs } = request;
	const { config, evidence } = inputs;

	try {
		return await runJudge(
			{
				budget: {
					sessionBudgetUsd: config.sessionBudgetUsd,
					spendCeiling: request.spendCeiling,
				},
				effort: config.judgeEffort,
				model: config.judgeModel,
			},
			{
				baselineContext: inputs.baselineContext,
				changedPaths: evidence.changedPaths,
				checkIntegrity: evidence.checkIntegrity,
				diff: evidence.diff,
				localChecks: evidence.localChecks,
				rubric: inputs.rubric,
			},
			request.invoke,
		);
	} catch (error) {
		const paid =
			error instanceof Error
				? paidJudgeFailure(error, request.spendCeiling)
				: undefined;
		if (paid !== undefined) {
			await request.writeFailedArtifact(
				buildFailedJudgeRunArtifact(
					{ ...inputs, elapsedMs: request.elapsedMs?.() },
					paid,
				),
			);
		}

		throw error;
	}
}

/**
 * Judges the run and builds its graded artifact, reading the run clock once
 * the judge returns so the run's elapsed time includes the judgment.
 */
async function judgeRun(
	request: FinalJudgeRequest & { readonly reviewFile: string },
): Promise<GradedRunArtifact> {
	const judge = await runFinalJudge(request);

	return buildRunArtifact({
		...request.artifactInputs,
		elapsedMs: request.elapsedMs?.(),
		judge,
		reviewFile: request.reviewFile,
	});
}

/** A refusal names the ceiling that refused, which for a rep may be its group's. */
function ceilingReadings(
	refusal: Readonly<SpendCeilingReachedError> | undefined,
	spendCeiling: SpendCeiling,
): CeilingStopReadings | undefined {
	if (refusal !== undefined) {
		return { ceilingUsd: refusal.ceilingUsd, spentUsd: refusal.spentUsd };
	}

	return spendCeiling.reached();
}

export { runFinalJudge, judgeRun, ceilingReadings, paidJudgeFailure };

export type { PaidJudgeFailure, FinalJudgeRequest };
