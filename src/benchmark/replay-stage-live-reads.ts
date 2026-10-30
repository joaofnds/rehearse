import type { ReplayRepContext } from "./replay-confirmation-runtime";
import stageLiveReads from "./stage-live-reads";
import type { LiveCorpusRead } from "./stage-live-reads";
import type { StageSessionResult } from "./stage-session-contract";

/** The live reads a replayed stage's session made of its frozen install. */
async function replayStageLiveReads(
	{ dependencies, plan, runtime }: ReplayRepContext,
	session: StageSessionResult,
): Promise<readonly LiveCorpusRead[]> {
	const { projectsDirectory } = dependencies;

	return await stageLiveReads({
		citations: runtime.frozen.citations,
		held: runtime.frozen.corpusDelivery.held,
		targetDir: plan.worktreePath,
		transcript:
			projectsDirectory === undefined
				? undefined
				: { projectsDirectory, sessionId: session.transcript.sessionId },
	});
}

export { replayStageLiveReads as default };
