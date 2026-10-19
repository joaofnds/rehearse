import type { FinalCandidate, Questioner } from "./calibration";
import type {
	CalibrationResult,
	GradedRunArtifact,
	StageScorecard,
} from "./contracts";
import type { JudgeAgreementReport } from "./judge-agreement";
import { completeRunArtifact } from "./run-artifact";
import type { recordRetentionRef } from "./target";
import { retentionRef } from "./target";

interface FinalCalibrationInput {
	readonly originalInstructions: string;
	readonly originalRubric: string;
	readonly finalRubricPath: string;
	readonly rubricsDirectory: string;
	readonly finalCandidate?: FinalCandidate | undefined;
	readonly stageScorecards: readonly StageScorecard[];
}

interface FinishGradedRunRequest {
	readonly pause: boolean;
	readonly runName: string;
	readonly targetDir: string;
	readonly resultSha: string;
	readonly artifact: GradedRunArtifact;
	readonly calibrationInput: FinalCalibrationInput;
}

interface FinishGradedRunDependencies {
	readonly recordRetentionRef: typeof recordRetentionRef;
	readonly collectCalibration: (
		input: FinalCalibrationInput,
	) => Promise<CalibrationResult>;
	readonly collectJudgeAgreement: (
		calibration: Readonly<CalibrationResult>,
	) => Promise<JudgeAgreementReport>;
	readonly completeArtifact: (artifact: GradedRunArtifact) => Promise<void>;
	readonly awaitArtifactReview: () => Promise<void>;
	readonly log: (message: string) => void;
}

/**
 * Whether a failed run stops for the reviewer before its checkout is removed.
 * Only a paused run may, and only when the stage-failure calibration has not
 * already held the checkout for the same purpose. A run without `--pause` skips the stop
 * rather than reaching it and recovering from a closed stdin, so nothing asks
 * a question nobody is there to answer.
 */
function pausesOnFailure(
	pause: boolean,
	stageFailureCalibrated: boolean,
): boolean {
	return pause && !stageFailureCalibrated;
}

/**
 * The stop a failed run makes so the reviewer can inspect the run's checkout
 * before it is removed. It is best effort: a terminal that closed mid-run, on
 * SIGHUP, makes the prompt throw, and that error would otherwise propagate in
 * place of the failure that got the run here. The removal then proceeds either
 * way, because holding the run's services for a reviewer who is not there is
 * the worse outcome.
 */
async function pauseForFailureInspection(
	rl: Questioner,
	targetDir: string,
	report: (message: string) => void | Promise<void>,
): Promise<void> {
	try {
		await rl.question(
			`The run failed. Inspect ${targetDir} if useful, then press Enter to remove the run's checkout.`,
		);
	} catch {
		await report("No interactive stdin; removing the run's checkout now.");
	}
}

/**
 * What a run does once the final Judge has spoken, and the one place the two
 * paths differ. With `--pause` the reviewer is still holding the run's
 * checkout, so the run calibrates and completes the artifact. Without it the
 * artifact stays at AWAITING_HUMAN_REVIEW and the candidate is pinned under the
 * run's retention ref before the caller removes the run's checkout, because
 * only the ref carries the commit into the target, where it keeps gc from
 * pruning it. `review` and `calibrate` finish the record afterwards, from the
 * frozen evidence.
 *
 * That artifact stops being pending before the removal begins. The removal is
 * seconds of git work with the signal handlers still registered, and an
 * artifact still pending is one an interrupt rewrites FAILED, which is a
 * status `calibrate` refuses to read.
 */
async function finishGradedRun(
	request: Readonly<FinishGradedRunRequest>,
	dependencies: Readonly<FinishGradedRunDependencies>,
): Promise<void> {
	if (!request.pause) {
		await dependencies.awaitArtifactReview();
		await dependencies.recordRetentionRef(
			request.targetDir,
			request.runName,
			request.resultSha,
		);
		dependencies.log(
			`Candidate retained at ${retentionRef(request.runName)}; removing the run's checkout. Record a review with \`rehearse review ${request.runName}\`, then \`rehearse calibrate ${request.runName}\`.`,
		);

		return;
	}

	const calibration = await dependencies.collectCalibration(
		request.calibrationInput,
	);
	const judgeAgreement = await dependencies.collectJudgeAgreement(calibration);
	await dependencies.completeArtifact(
		completeRunArtifact(request.artifact, calibration, judgeAgreement),
	);
	dependencies.log("Calibration recorded; removing the run's checkout.");
}

export { pausesOnFailure, pauseForFailureInspection, finishGradedRun };

export type {
	FinalCalibrationInput,
	FinishGradedRunRequest,
	FinishGradedRunDependencies,
};
