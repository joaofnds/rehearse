import { confirmationRepRecordSchema } from "./confirmation-record";
import type { ConfirmationRepRecord } from "./confirmation-record";
import type { LiveCorpusRead } from "./stage-live-reads";
import type { StageSessionDependencies } from "./stage-session-dependencies";
import StageSessionError from "./stage-session-error";

const RECORD_JSON_INDENT_SPACES = 2;

/** Rewrites a recorded rep as one whose every judged stage made `reads` live. */
async function addStageLiveReads(
	repFile: string,
	reads: readonly LiveCorpusRead[],
): Promise<void> {
	const rep = confirmationRepRecordSchema.parse(
		JSON.parse(await Bun.file(repFile).text()),
	);
	const stages: ConfirmationRepRecord["stages"][number][] = [];
	for (const stage of rep.stages) {
		stages.push(
			stage.status === "JUDGED" ? { ...stage, liveReads: [...reads] } : stage,
		);
	}
	await Bun.write(
		repFile,
		`${JSON.stringify({ ...rep, stages }, null, RECORD_JSON_INDENT_SPACES)}\n`,
	);
}

/** One transcript line in which the session reads `filePath`. */
function readTranscriptLine(filePath: string): string {
	const read = {
		id: "read-1",
		input: { file_path: filePath },
		name: "Read",
		type: "tool_use",
	};

	return `${JSON.stringify({ message: { content: [read] }, type: "assistant" })}\n`;
}

/** The same dependencies, whose stage session runs and then fails. */
function failingAfterSession<
	Dependencies extends { readonly stageSession: StageSessionDependencies },
>(dependencies: Dependencies): Dependencies {
	const { stageSession } = dependencies;

	return {
		...dependencies,
		stageSession: {
			...stageSession,
			runWorkflowStage: async (request) => {
				const transcript = await stageSession.runWorkflowStage(request);

				return await Promise.reject(
					new StageSessionError({
						cause: new Error("synthetic session failure"),
						costUsd: undefined,
						providerCalls: [],
						sessionId: transcript.sessionId,
					}),
				);
			},
		},
	};
}

export { addStageLiveReads, failingAfterSession, readTranscriptLine };
