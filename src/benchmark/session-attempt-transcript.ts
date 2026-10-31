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

const MEMORY_DIRECTORY = "memory";

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

/**
 * Removes what the attempt left in the user's projects directory: its
 * transcript, its session directory once the record holds the sub-agent files
 * in it, and the slug's memory directory and the slug itself only while empty,
 * since another live session can write into the same slug. Removal errors are
 * tolerated so a cleanup failure never replaces the attempt's recorded result.
 */
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
	await Promise.allSettled([rmdir(join(slug, MEMORY_DIRECTORY))]);
	await Promise.allSettled([rmdir(slug)]);

	await rm(attemptDirectory, { force: true, recursive: true });
}

export { preservedTranscript, transcriptRecord, removeAttemptFiles };
