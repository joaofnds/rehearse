import { homedir } from "node:os";
import { join } from "node:path";

import type { CorpusDelivery } from "./corpus-delivery";
import type { HomePathCitationMap } from "./home-path-citation";
import liveCitationMap from "./live-citation-map";
import { liveCorpusSource } from "./live-corpus-source";
import installStageCorpusSnapshot from "./stage-corpus-install";

/** Installs a stage snapshot into a target and reports how its text was delivered. */
type StageCorpusInstaller = (
	snapshotDirectory: string,
	targetDirectory: string,
) => Promise<CorpusDelivery>;

/** The live install's citation map, read on the first install of a run. */
interface LiveCitationCache {
	citations?: Promise<HomePathCitationMap>;
}

/**
 * The stage installer a run uses: it maps the user's live install once, on
 * the first install, so every stage of the run redirects against the same
 * map, and the live install is only read.
 */
function liveStageCorpusInstaller(
	home: string = homedir(),
): StageCorpusInstaller {
	const mapped: LiveCitationCache = {};

	return async (snapshotDirectory, targetDirectory) => {
		mapped.citations ??= liveCitationMap(
			liveCorpusSource({ root: join(home, ".claude") }),
			home,
		);

		return await installStageCorpusSnapshot(
			snapshotDirectory,
			targetDirectory,
			await mapped.citations,
		);
	};
}

export { liveStageCorpusInstaller as default };
export type { StageCorpusInstaller };
