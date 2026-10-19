import { mkdir, rm, rmdir } from "node:fs/promises";
import { join } from "node:path";

import type {
	AttemptCleanupFiles,
	PreservedTranscript,
	TranscriptRecord,
} from "./session-attempt-contract";
import {
	preserveSubagentFiles,
	providerSessionDirectory,
	subagentFilesRetained,
	unavailableSubagents,
} from "./subagent-evidence";
import { parseTranscriptFile, transcriptDiagnostics } from "./transcript";

async function preservedTranscript(
	recordDirectory: string,
	writtenTranscript: string,
	cut: number,
): Promise<PreservedTranscript> {
	const written = Bun.file(writtenTranscript);
	const sourceAvailable = await written.exists();
	const transcriptFile = join(recordDirectory, "transcript.jsonl");
	await mkdir(recordDirectory, { recursive: true });
	await Bun.write(transcriptFile, sourceAvailable ? written : "");
	await preserveSubagentFiles(writtenTranscript, recordDirectory);

	const lines = await parseTranscriptFile(transcriptFile);

	return {
		file: transcriptFile,
		lines,
		sourceAvailable,
		unavailableSubagents: await unavailableSubagents(
			lines.slice(cut),
			recordDirectory,
		),
	};
}

function transcriptRecord(
	prefixLinesExcluded: number,
	transcript: Readonly<PreservedTranscript>,
): TranscriptRecord {
	return {
		transcriptDiagnostics: transcriptDiagnostics({
			lines: transcript.lines,
			prefixLinesExcluded,
			sourceAvailable: transcript.sourceAvailable,
		}),
		transcriptFile: transcript.file,
		unavailableSubagents: transcript.unavailableSubagents,
	};
}

async function removeAttemptFiles({
	attemptDirectory,
	slug,
	transcriptPath,
	recordDirectory,
}: AttemptCleanupFiles): Promise<void> {
	await rm(transcriptPath, { force: true });
	if (await subagentFilesRetained(transcriptPath, recordDirectory)) {
		await Promise.allSettled([
			rm(providerSessionDirectory(transcriptPath), {
				force: true,
				recursive: true,
			}),
		]);
	}
	await Promise.allSettled([rmdir(slug)]);

	await rm(attemptDirectory, { force: true, recursive: true });
}

export { preservedTranscript, transcriptRecord, removeAttemptFiles };
