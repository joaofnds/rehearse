import type { EditedCorpus } from "#benchmark/corpus-edit";
import { linkedCorpusSource } from "#benchmark/corpus-source";
import { HTTP_STATUS_CONFLICT } from "#server/http-status";
import { LaunchRefusalError } from "#server/launch-refusal";
import type { LaunchDependencies } from "#server/launches-contract";
import { liveLaunches } from "#server/run-history";

const EMPTY_COLLECTION_LENGTH = 0;

async function editedCorpus(
	dependencies: LaunchDependencies,
): Promise<EditedCorpus> {
	const source = await linkedCorpusSource(
		dependencies.runsDirectory,
		dependencies.liveCorpus,
	);
	const live = dependencies.liveCorpus();

	return {
		live,
		source,
	};
}

/**
 * A launch that is running reads the linked corpus as its stages go, so an
 * edit under it would change what they measure. A record that does not read
 * refuses nothing, as in `analysisInFlight`.
 */
async function refuseEditUnderLiveLaunch({
	runsDirectory,
	liveness,
}: Readonly<LaunchDependencies>): Promise<void> {
	const { launches } = await liveLaunches(runsDirectory, liveness);
	if (launches.length > EMPTY_COLLECTION_LENGTH) {
		throw new LaunchRefusalError(
			`Launch ${launches.map(({ id }) => id).join(", ")} is running against the linked corpus; apply the edit once it ends`,
			HTTP_STATUS_CONFLICT,
		);
	}
}

export { editedCorpus, refuseEditUnderLiveLaunch };
