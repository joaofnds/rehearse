import { confirmationRepRecordSchema } from "./confirmation-record";
import type { ConfirmationRepRecord } from "./confirmation-record";
import type { LiveCorpusRead } from "./stage-live-reads";

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

export { addStageLiveReads, readTranscriptLine };
