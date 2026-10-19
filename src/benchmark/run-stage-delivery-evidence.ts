import type { BuildEvidence } from "./run-artifact";
import type { StageDependencies } from "./run-stage-contract";
import type {
	StageSessionEnvironment,
	StageSessionResult,
} from "./stage-session-contract";
import { measureDeliveryChecks } from "./stage-session-judgment-input";

/**
 * What the final Judge grades a delivery stage on. When a lowered minimum
 * grade carries the run past a delivery its validation rejected, that is the
 * checkout as the stage left it, measured as a committed delivery is and
 * kept as a snapshot commit, since its HEAD lacks the uncommitted files.
 */
async function deliveryEvidence(
	dependencies: StageDependencies,
	environment: StageSessionEnvironment,
	session: StageSessionResult,
): Promise<BuildEvidence> {
	if (session.buildEvidence !== undefined) {
		return session.buildEvidence;
	}

	const candidate = await dependencies.captureBuildCandidate(
		environment.targetDir,
		environment.baselineSha,
	);

	const resultSha = await dependencies.snapshotCheckout(
		environment.targetDir,
		environment.baselineSha,
	);

	return {
		changedPaths: candidate.changedPaths,
		diff: candidate.diff,
		resultSha,
		...(await measureDeliveryChecks(dependencies, environment)),
		taskState: session.input.taskState,
	};
}

export { deliveryEvidence as default };
