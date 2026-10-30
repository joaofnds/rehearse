import { join } from "node:path";

import { NOTHING_DELIVERED } from "./corpus-delivery";
import type { HomePathCitationMap } from "./home-path-citation";
import liveCitationMap from "./live-citation-map";
import { liveCorpusSource } from "./live-corpus-source";
import type {
	CorpusOverlay,
	SessionAttemptRequest,
} from "./session-attempt-preparation-contract";
import {
	installSessionCorpusSnapshot,
	snapshotStyleName,
} from "./session-corpus";

/**
 * The citation map of the install a session runs with, from that home and the
 * environment that can name its backing root, so a run under another home
 * redirects citations of that home's install.
 */
async function sessionCitationMap(
	home: string,
	environment: Readonly<Record<string, string | undefined>>,
): Promise<HomePathCitationMap> {
	return await liveCitationMap(
		liveCorpusSource({ env: environment, root: join(home, ".claude") }),
		home,
	);
}

async function installCorpusOverlay(
	request: Pick<SessionAttemptRequest, "corpusSnapshot" | "liveCitations">,
	attemptDirectory: string,
): Promise<CorpusOverlay> {
	const snapshot = request.corpusSnapshot;
	const citations = request.liveCitations;
	if (snapshot === undefined) {
		return {
			citations,
			delivery: NOTHING_DELIVERED,
			held: [],
			installed: [],
			styleName: undefined,
		};
	}

	return {
		...(await installSessionCorpusSnapshot(
			snapshot,
			attemptDirectory,
			citations,
		)),
		citations,
		styleName: snapshotStyleName(snapshot),
	};
}

export { installCorpusOverlay as default, sessionCitationMap };
