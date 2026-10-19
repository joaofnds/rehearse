import {
	closedStageSession,
	stageSessionRecord,
} from "#server/stage-session-closed";
import type {
	StageSession,
	StageSessionRequest,
} from "#server/stage-session-contract";
import {
	recordedStart,
	recordedTranscript,
	transcriptTail,
} from "#server/stage-session-live";

/**
 * A stage's session as the pane shows it. A running stage's transcript is the
 * provider's own file, found only from what the run recorded: the source root
 * its manifest names and the session id its stage start carries. No part of
 * that path comes from the request, and the file must be a real file inside
 * the projects directory.
 */
async function readStageSession(
	request: Readonly<StageSessionRequest>,
): Promise<StageSession> {
	const { stageOfRun, record } = await stageSessionRecord(request);
	if (record.state !== "absent") {
		return await closedStageSession(stageOfRun, record);
	}

	const start = await recordedStart(
		request.runsDirectory,
		stageOfRun.run,
		stageOfRun.stage,
	);
	if (start?.sessionId === undefined) {
		return start === undefined
			? { state: "not-started" }
			: { state: "untracked" };
	}

	const { file, projectsRoot } = await recordedTranscript({
		projectsDirectory: request.projectsDirectory,
		sessionId: start.sessionId,
		sourceRoot: stageOfRun.manifest.sourceRoot,
	});
	const tail: StageSession =
		file === undefined
			? { lineCount: 0, lines: [], state: "running" }
			: await transcriptTail(projectsRoot, file);

	return tail;
}

export { readStageSession as default };
export type {
	StageSessionRequest,
	SessionLineKind,
	SessionLine,
	CitedSpan,
	StageSession,
} from "#server/stage-session-contract";
