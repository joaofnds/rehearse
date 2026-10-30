import { join } from "node:path";

import { NOTHING_DELIVERED } from "./corpus-delivery";
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
 * The citation map comes from the home the session runs with, so a run under
 * another home redirects citations of that home's install.
 */
async function installCorpusOverlay(
	request: Pick<
		SessionAttemptRequest,
		"corpusSnapshot" | "home" | "environment"
	>,
	attemptDirectory: string,
): Promise<CorpusOverlay> {
	const snapshot = request.corpusSnapshot;
	if (snapshot === undefined) {
		return {
			citations: { home: request.home, roots: [] },
			delivery: NOTHING_DELIVERED,
			held: [],
			installed: [],
			styleName: undefined,
		};
	}

	const citations = await liveCitationMap(
		liveCorpusSource({
			env: request.environment,
			root: join(request.home, ".claude"),
		}),
		request.home,
	);

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

export { installCorpusOverlay as default };
