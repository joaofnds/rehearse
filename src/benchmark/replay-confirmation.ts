import { openGroupDirectory } from "./in-flight-claim";
import type { ReplayDependencies } from "./replay";
import type {
	ReplayConfirmationOutcome,
	ReplayConfirmationRequest,
} from "./replay-confirmation-contract";
import freezeReplayInputs from "./replay-confirmation-inputs";
import ReplayConfirmationLifetime from "./replay-confirmation-lifetime";
import { confirmationGroupPaths } from "./run-layout";
import { claimShortId } from "./short-id";

async function runReplayConfirmation(
	dependencies: ReplayDependencies,
	request: ReplayConfirmationRequest,
): Promise<ReplayConfirmationOutcome> {
	const now = request.now ?? (() => performance.now());
	const paths = confirmationGroupPaths(
		request.paths.runsDirectory,
		request.groupId,
	);
	await openGroupDirectory(paths);
	const frozen = await freezeReplayInputs(dependencies, request, {
		groupDirectory: paths.directory,
		inputsDirectory: paths.inputsDirectory,
	});
	await claimShortId(request.paths.runsDirectory, frozen.manifest.caseId, {
		groupId: request.groupId,
		kind: "group",
		source: { run: request.paths.name, stage: request.stage },
	});
	const lifetime = await ReplayConfirmationLifetime.open({
		dependencies,
		frozen,
		paths,
		request,
	});

	return await lifetime.confirm({ frozen, now, paths });
}

export { runReplayConfirmation as default };
export type {
	ReplayConfirmationRequest,
	ReplayConfirmationOutcome,
} from "./replay-confirmation-contract";
