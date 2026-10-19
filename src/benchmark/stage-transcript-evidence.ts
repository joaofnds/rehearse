import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import type { Immutable } from "./contracts";
import { projectSlug } from "./session-capture";
import { preserveSubagentFiles } from "./subagent-evidence";

/**
 * Where the provider writes a session's transcript: one file per session id,
 * under a slug derived from the working directory. Session attempts already
 * resolve it this way; a stage knows both halves by the time it checkpoints.
 */
interface StageTranscriptSource {
	readonly sessionId: string;
	readonly projectsDirectory: string;
}

/**
 * A stage's raw session transcript, or an explicit statement that the provider
 * supplied none. The status is recorded rather than inferred from a missing
 * file, because a reader that finds no transcript cannot otherwise tell a stage
 * that produced none from one whose capture was never attempted, and would be
 * free to read the stage's parsed exchanges as if they were the raw record.
 *
 * The field is optional: checkpoints written before this existed carry no
 * transcript at all, and must keep parsing.
 */
const stageTranscriptEvidenceSchema = z.discriminatedUnion("status", [
	z.object({
		file: z.string().nonempty(),
		sessionId: z.string().nonempty(),
		status: z.literal("AVAILABLE"),
	}),
	z.object({
		sessionId: z.string().nonempty(),
		status: z.literal("UNAVAILABLE"),
	}),
]);

type StageTranscriptEvidence = Immutable<
	z.infer<typeof stageTranscriptEvidenceSchema>
>;

/**
 * The snapshot is a byte-faithful copy, never the bounded captures used for
 * judge context: materializing it must reproduce exactly the state the next
 * stage consumed (ACT-2 decision 2).
 */
const TRANSCRIPT_FILE = "transcript.jsonl";

/** Where the provider wrote a stage session's transcript. */
function stageTranscriptFile(
	targetDir: string,
	source: StageTranscriptSource,
): string {
	return join(
		source.projectsDirectory,
		projectSlug(targetDir),
		`${source.sessionId}.jsonl`,
	);
}

/**
 * Copies the provider's transcript, and its sub-agents' transcripts and meta
 * files, into `directory`, beside the checkpoint or a stopped stage's stop
 * record, so they survive the working directory they were written under. The
 * bytes are copied rather than the path recorded: the source lives in the
 * operator's own projects directory and a later read of an absolute path
 * there has already broken once. The session ran in the target
 * repository, so its files there are left in place, as the operator's own
 * sessions in that repository are.
 */
async function preserveStageTranscript(
	targetDir: string,
	directory: string,
	source: StageTranscriptSource | undefined,
): Promise<StageTranscriptEvidence | undefined> {
	if (source === undefined) {
		return undefined;
	}

	const transcriptPath = stageTranscriptFile(targetDir, source);
	const written = Bun.file(transcriptPath);
	if (!(await written.exists())) {
		return { sessionId: source.sessionId, status: "UNAVAILABLE" };
	}

	await mkdir(directory, { recursive: true });
	await Bun.write(join(directory, TRANSCRIPT_FILE), written);
	await preserveSubagentFiles(transcriptPath, directory);

	return {
		file: TRANSCRIPT_FILE,
		sessionId: source.sessionId,
		status: "AVAILABLE",
	};
}
export {
	TRANSCRIPT_FILE,
	stageTranscriptFile,
	preserveStageTranscript,
	stageTranscriptEvidenceSchema,
};
export type { StageTranscriptSource, StageTranscriptEvidence };
