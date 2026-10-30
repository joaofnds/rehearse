import { confirmationRepRecordSchema } from "./confirmation-record";
import type { ConfirmationRepRecord } from "./confirmation-record";
import type { Immutable } from "./contracts";
import type { LiveCorpusRead } from "./stage-live-reads";
import type { StageSessionDependencies } from "./stage-session-dependencies";
import StageSessionError from "./stage-session-error";
import type { WorkflowStageRequest } from "./workflow";

const RECORD_JSON_INDENT_SPACES = 2;

type RecordedStage = ConfirmationRepRecord["stages"][number];

type JudgedStage = Extract<RecordedStage, { status: "JUDGED" }>;

/** Rewrites a recorded rep's every judged stage, and its outcome to `outcome`. */
async function rewriteJudgedStages(
	repFile: string,
	rewrite: (stage: Immutable<JudgedStage>) => RecordedStage,
	outcome?: ConfirmationRepRecord["outcome"],
): Promise<void> {
	const rep = confirmationRepRecordSchema.parse(
		JSON.parse(await Bun.file(repFile).text()),
	);
	const stages: RecordedStage[] = [];
	for (const stage of rep.stages) {
		stages.push(stage.status === "JUDGED" ? rewrite(stage) : stage);
	}
	const rewritten = { ...rep, outcome: outcome ?? rep.outcome, stages };
	await Bun.write(
		repFile,
		`${JSON.stringify(rewritten, null, RECORD_JSON_INDENT_SPACES)}\n`,
	);
}

/** Rewrites a recorded rep as one whose every judged stage made `reads` live. */
async function addStageLiveReads(
	repFile: string,
	reads: readonly LiveCorpusRead[],
): Promise<void> {
	await rewriteJudgedStages(repFile, (stage) => ({
		...stage,
		liveReads: [...reads],
	}));
}

/**
 * Rewrites a recorded rep as one whose every judged stage made `reads` live
 * and then failed.
 */
async function failStagesWithLiveReads(
	repFile: string,
	reads: readonly LiveCorpusRead[],
): Promise<void> {
	await rewriteJudgedStages(
		repFile,
		({ stage }) => ({
			error: "synthetic stage failure",
			liveReads: [...reads],
			stage,
			status: "EXECUTION_FAILED",
		}),
		"UNSUCCESSFUL",
	);
}

/** Each rep's stages as the live reads each recorded, or "none" without them. */
function recordedLiveReads(
	reps: Immutable<readonly Pick<ConfirmationRepRecord, "stages">[]>,
): readonly (readonly (Immutable<LiveCorpusRead[]> | "none")[])[] {
	return reps.map(({ stages }) =>
		stages.map((stage) =>
			"liveReads" in stage ? (stage.liveReads ?? "none") : "none",
		),
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

/** The same dependencies, whose stage session runs and fails before it ends. */
function failingBeforeSessionEnds<
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

/**
 * The same dependencies, whose stage fails with `failure` before any session
 * runs, so no transcript is ever written.
 */
function failingBeforeSessionStarts(
	failure: (request: WorkflowStageRequest) => Error,
): <Dependencies extends { readonly stageSession: StageSessionDependencies }>(
	dependencies: Dependencies,
) => Dependencies {
	return (dependencies) => ({
		...dependencies,
		stageSession: {
			...dependencies.stageSession,
			runWorkflowStage: async (request) =>
				await Promise.reject(failure(request)),
		},
	});
}

/** A failure that names no session. */
function unnamedFailure(): Error {
	return new Error("synthetic setup failure");
}

/** A failure that names the session the stage asked for, which never ran. */
function namedFailure(request: WorkflowStageRequest): Error {
	return new StageSessionError({
		cause: new Error("synthetic setup failure"),
		costUsd: 0,
		providerCalls: [],
		sessionId: request.sessionId,
	});
}

export {
	addStageLiveReads,
	failStagesWithLiveReads,
	failingBeforeSessionEnds,
	failingBeforeSessionStarts,
	namedFailure,
	readTranscriptLine,
	recordedLiveReads,
	unnamedFailure,
};
