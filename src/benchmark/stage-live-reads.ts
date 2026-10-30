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
 * Without a transcript to read, or with none at its path, nothing is known,
 * which differs from a session that made no live read, so there is no list.
 */
async function stageLiveReads(
	request: StageLiveReadsRequest,
): Promise<readonly LiveCorpusRead[] | undefined> {
	if (request.transcript === undefined) {
		return undefined;
	}
	const main = stageTranscriptFile(request.targetDir, request.transcript);
	if (!(await Bun.file(main).exists())) {
		return undefined;
	}
	const subagents = await recordedSubagents(providerSessionDirectory(main));
	const uses = [
		...toolUses(await parseTranscriptFile(main)),
		...subagents.flatMap(({ transcript }) =>
			toolUses(parseTranscript(transcript)),
		),
	];

	return liveCorpusReads(uses, request.citations, new Set(request.held));
}

/** The stage record field for these reads, none when no transcript was read. */
function liveReadsField(reads: readonly LiveCorpusRead[] | undefined): {
	readonly liveReads?: LiveCorpusRead[];
} {
	return reads === undefined ? {} : { liveReads: [...reads] };
}

export { stageLiveReads as default, liveReadsField };
export type { StageLiveReadsRequest };
export type { LiveCorpusRead } from "./live-corpus-reads";
