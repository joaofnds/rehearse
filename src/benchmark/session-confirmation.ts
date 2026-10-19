import type { ConfirmationGroupOutcome } from "./confirmation-evidence";
import { startTime } from "./recorded-time";
import { confirmationGroupPaths } from "./run-layout";
import type {
	SessionConfirmationDependencies,
	SessionConfirmationRequest,
} from "./session-confirmation-contract";
import executeSessionReps from "./session-confirmation-execution";
import finalizeSessionGroup from "./session-confirmation-finalization";
import freezeInputs from "./session-confirmation-inputs";
import storeSessionReps from "./session-confirmation-storage";
import { claimShortId } from "./short-id";

async function runSessionConfirmation(
	dependencies: SessionConfirmationDependencies,
	request: SessionConfirmationRequest,
): Promise<ConfirmationGroupOutcome> {
	const clocks = {
		now: dependencies.now ?? Date.now,
		wallClock: dependencies.wallClock ?? Date.now,
	};
	const paths = confirmationGroupPaths(request.runsDirectory, request.groupId);
	const inputs = await freezeInputs(
		request,
		{ groupDirectory: paths.directory, inputsDirectory: paths.inputsDirectory },
		dependencies.resolveCorpus,
	);
	await claimShortId(
		request.runsDirectory,
		request.sessionCase.declaration.id,
		{ groupId: request.groupId, kind: "group" },
	);
	const startedAt = startTime(clocks.wallClock);
	const makespanStart = clocks.now();
	const context = { dependencies, inputs, paths, request, ...clocks };
	const results = await executeSessionReps(context);
	const repResults = await storeSessionReps(context, results);

	return await finalizeSessionGroup(context, repResults, {
		makespanStart,
		startedAt,
	});
}
export { runSessionConfirmation };
export type {
	SessionConfirmationRequest,
	SessionConfirmationRepPlan,
	SessionConfirmationDependencies,
} from "./session-confirmation-contract";
export { default as SessionInvocationError } from "./session-invocation-error";
