import type { HomePathCitationMap } from "./home-path-citation";
import liveCorpusReads from "./live-corpus-reads";
import type { LiveCorpusRead } from "./live-corpus-reads";
import type { StageTranscriptSource } from "./stage-transcript-evidence";
import { stageTranscriptFile } from "./stage-transcript-evidence";
import {
	providerSessionDirectory,
	recordedSubagents,
} from "./subagent-evidence";
import { parseTranscript, parseTranscriptFile, toolUses } from "./transcript";

interface StageLiveReadsRequest {
	readonly targetDir: string;
	readonly transcript: StageTranscriptSource | undefined;
	readonly held: readonly string[];
	readonly citations: HomePathCitationMap;
}

/**
 * The live reads a stage session and its sub-agents made of files the stage's
 * install held, read from the provider's own transcripts once the stage ends.
 * A stage with no transcript to read records none.
 */
async function stageLiveReads(
	request: StageLiveReadsRequest,
): Promise<readonly LiveCorpusRead[]> {
	if (request.transcript === undefined) {
		return [];
	}
	const main = stageTranscriptFile(request.targetDir, request.transcript);
	const subagents = await recordedSubagents(providerSessionDirectory(main));
	const uses = [
		...toolUses(await parseTranscriptFile(main)),
		...subagents.flatMap(({ transcript }) =>
			toolUses(parseTranscript(transcript)),
		),
	];

	return liveCorpusReads(uses, request.citations, new Set(request.held));
}

export { stageLiveReads as default };
export type { StageLiveReadsRequest };
export type { LiveCorpusRead } from "./live-corpus-reads";
