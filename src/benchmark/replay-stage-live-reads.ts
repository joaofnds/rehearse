import type { ReplayRepContext } from "./replay-confirmation-runtime";
import stageLiveReads from "./stage-live-reads";
import type { LiveCorpusRead } from "./stage-live-reads";
import type { StageSessionResult } from "./stage-session-contract";
import { failedStageSessionId } from "./stage-session-error";

/** The live reads a replayed stage's session made of its frozen install. */
async function replayStageLiveReads(
	{ dependencies, plan, runtime }: ReplayRepContext,
	sessionId: string,
): Promise<readonly LiveCorpusRead[] | undefined> {
	const { projectsDirectory } = dependencies;

	return await stageLiveReads({
		citations: runtime.frozen.citations,
		held: runtime.frozen.corpusDelivery.held,
		targetDir: plan.worktreePath,
		transcript:
			projectsDirectory === undefined
				? undefined
				: { projectsDirectory, sessionId },
	});
}

/** The live reads of a replayed stage that failed, none if no session started. */
async function failedReplayStageLiveReads(
	context: ReplayRepContext,
	session: StageSessionResult | undefined,
	failure: Readonly<Error>,
): Promise<readonly LiveCorpusRead[] | undefined> {
	const sessionId = failedStageSessionId(session, failure);

	return sessionId === undefined
		? undefined
		: await replayStageLiveReads(context, sessionId);
}

export { replayStageLiveReads as default, failedReplayStageLiveReads };
