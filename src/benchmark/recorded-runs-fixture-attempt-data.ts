import type { z } from "zod";

import { corpusPath } from "./recorded-runs-fixture-environment";
import {
	CORPUS_DIGEST,
	EVIDENCE_PREVIEW_CHARACTER_COUNT,
	GIT_SHA1_HEX_DIGITS,
} from "./recorded-runs-fixture-readings";
import { replayRecordSchema } from "./replay";
import { sessionAttemptRecordSchema } from "./session-record";
import type { SessionAttemptRecord } from "./session-record";

type ParsedReplayRecord = z.infer<typeof replayRecordSchema>;

const sessionTranscriptDiagnostics = {
	issues: [],
	measuredLineCount: 4,
	prefixLinesExcluded: 0,
	repeatedBashCommands: [
		{
			commandCharacters: 161,
			commandSha256:
				"fdb7f3c40645e79ca4c5d1638753243ccb283f5dd126ceb21de5fa7d40953c65",
			occurrences: [
				{ location: { block: 1, line: 1 }, toolUseId: "bash-1" },
				{ location: { block: 1, line: 3 }, toolUseId: "bash-2" },
			],
			preview: "x".repeat(EVIDENCE_PREVIEW_CHARACTER_COUNT),
			previewTruncated: true,
		},
	],
	sourceLineCount: 4,
	state: "complete",
	toolErrors: [],
	toolUseOccurrences: {
		byName: [{ count: 2, name: "Bash" }],
		total: 2,
	},
};

interface ReplayRecordProps {
	readonly runName: string;
	readonly timestamp: string;
}

const AttemptRecordData = {
	replay(props: ReplayRecordProps): ParsedReplayRecord {
		return replayRecordSchema.parse({
			baseSha: "2".repeat(GIT_SHA1_HEX_DIGITS),
			consumed: {
				lineage: "lineage-discuss",
				stage: "discuss",
				targetSha: "2".repeat(GIT_SHA1_HEX_DIGITS),
			},
			controlSha: "1".repeat(GIT_SHA1_HEX_DIGITS),
			corpusFiles: [{ path: corpusPath("build"), sha256: CORPUS_DIGEST }],
			judgeCostUsd: 0.5,
			judgeModel: "opus",
			lineage: "lineage-build",
			model: "sonnet",
			productOwnerCostUsd: 0.25,
			replay: true,
			runName: props.runName,
			scorecard: {
				costUsd: 1,
				grade: { dimensions: [], grade: "A", verdict: "CONTINUE" },
				stage: "build",
			},
			sessionBudgetUsd: 5,
			stage: "build",
			stageCostUsd: 1,
			stale: false,
			staleness: [],
			timestamp: props.timestamp,
		});
	},
	session(caseId: string): SessionAttemptRecord {
		return sessionAttemptRecordSchema.parse({
			caseId,
			checks: [{ detail: "120 words", kind: "word-band", status: "PASS" }],
			corpusFiles: [
				{
					path: "output-styles/brief.md",
					resolvedPath: "/corpus/output-styles/brief.md",
					sha256: CORPUS_DIGEST,
				},
			],
			elapsedMs: 1000,
			lineage: "session-lineage",
			metrics: {
				cacheReadTokens: 0,
				cacheWriteTokens: 0,
				costUsd: 0.5,
				inputTokens: 10,
				outputTokens: 20,
				turns: 1,
			},
			model: "sonnet",
			outcome: "SUCCESSFUL",
			prompt: "write the reply",
			reply: "the reply",
			schemaVersion: 1,
			sessionBudgetUsd: 2,
			transcriptDiagnostics: sessionTranscriptDiagnostics,
			transcriptFile: "transcript.jsonl",
		});
	},
};

export { AttemptRecordData as default };
