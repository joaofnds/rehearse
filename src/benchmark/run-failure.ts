import type { BenchmarkRunExecution } from "./run-execution-context";
import { recordPaused } from "./run-pause";
import type RunReview from "./run-review";
import {
	pauseForFailureInspection,
	pausesOnFailure,
} from "./run-review-completion";

interface RunFailureObservation {
	readonly message: string;
	readonly pausedStage: string | undefined;
}
async function reportRunFailure(
	execution: BenchmarkRunExecution,
	review: Readonly<RunReview> | undefined,
	failure: RunFailureObservation,
): Promise<void> {
	const { message, pausedStage } = failure;
	if (pausedStage !== undefined) {
		await recordPaused(
			execution.identity.files,
			pausedStage,
			new Date().toISOString(),
		);
		return;
	}
	await execution.lifetime.abort.markAborted(message);
	if (
		pausesOnFailure(
			execution.inputs.config.pause,
			review?.stageFailureCalibrated ?? false,
		)
	) {
		await pauseForFailureInspection(
			execution.interaction.rl,
			execution.source.root,
			execution.output.reportError,
		);
	}
}
export { reportRunFailure as default };

export type { RunFailureObservation };
