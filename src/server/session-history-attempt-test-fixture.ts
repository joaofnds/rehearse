import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import type { Immutable } from "#benchmark/contracts";
import { sessionAttemptPaths } from "#benchmark/run-layout";
import type { LegacySessionAttemptRecord } from "#benchmark/session-record";
import RECORD_JSON_INDENT_SPACES from "#server/json-record-format";
import SavedSessionRecordBuilder from "#server/saved-session-record-test-builder";
import { historyRunsDirectory } from "#server/session-history-workspace-test-fixture";

const assistant = (
	requestId: string,
	model: string,
	usage: {
		readonly input: number;
		readonly output: number;
		readonly cacheWrite: number;
	},
): string =>
	JSON.stringify({
		cwd: "/work",
		message: {
			content: [{ text: "reply", type: "text" }],
			model,
			usage: {
				cache_creation: {
					ephemeral_1h_input_tokens: usage.cacheWrite,
					ephemeral_5m_input_tokens: 0,
				},
				cache_creation_input_tokens: usage.cacheWrite,
				cache_read_input_tokens: 0,
				input_tokens: usage.input,
				output_tokens: usage.output,
			},
		},
		requestId,
		type: "assistant",
	});

const RESUMED_RECORD_PATCH = {
	metrics: {
		cacheReadTokens: 0,
		cacheWriteTokens: 251_695,
		costUsd: 1.008294,
		inputTokens: 2,
		outputTokens: 151,
		turns: 1,
	},
	sessionBudgetUsd: 2,
	transcriptDiagnostics: {
		issues: [],
		measuredLineCount: 1,
		prefixLinesExcluded: 1,
		repeatedBashCommands: [],
		sourceLineCount: 2,
		state: "complete",
		toolErrors: [],
		toolUseOccurrences: { byName: [], total: 0 },
	},
} satisfies Immutable<Partial<LegacySessionAttemptRecord>>;

const ATTEMPT_TRANSCRIPT = [
	JSON.stringify({
		cwd: "/work",
		message: {
			content: [
				{
					id: "read-1",
					input: { file_path: "/work/CLAUDE.md" },
					name: "Read",
					type: "tool_use",
				},
			],
		},
		type: "assistant",
	}),
	JSON.stringify({
		message: {
			content: [
				{
					content: "1\tproject instructions",
					tool_use_id: "read-1",
					type: "tool_result",
				},
			],
		},
		type: "user",
	}),
].join("\n");

const RESUMED_TRANSCRIPT = [
	assistant("req-inherited", "claude-opus-5", {
		cacheWrite: 9,
		input: 7,
		output: 90_592,
	}),
	assistant("req-attempt", "claude-sonnet-5", {
		cacheWrite: 251_695,
		input: 2,
		output: 151,
	}),
].join("\n");

async function writtenAttempt(): Promise<{
	readonly runsDirectory: string;
	readonly caseId: string;
	readonly uuid: string;
}> {
	const runsDirectory = await historyRunsDirectory("rehearse-history-reader-");
	const caseId = "case-a";
	const uuid = "attempt-a";
	const paths = sessionAttemptPaths(runsDirectory, { caseId, uuid });
	await mkdir(paths.directory, { recursive: true });

	const record = new SavedSessionRecordBuilder({ caseId }).build();
	await Bun.write(
		paths.recordFile,
		`${JSON.stringify(record, null, RECORD_JSON_INDENT_SPACES)}\n`,
	);
	await Bun.write(
		join(paths.directory, "transcript.jsonl"),
		ATTEMPT_TRANSCRIPT,
	);

	return { caseId, runsDirectory, uuid };
}

async function writtenResumedAttempt(): Promise<{
	readonly runsDirectory: string;
	readonly caseId: string;
	readonly uuid: string;
}> {
	const runsDirectory = await historyRunsDirectory("rehearse-history-series-");
	const caseId = "case-resumed";
	const uuid = "attempt-resumed";
	const paths = sessionAttemptPaths(runsDirectory, { caseId, uuid });
	await mkdir(paths.directory, { recursive: true });

	const record = new SavedSessionRecordBuilder({
		caseId,
		...RESUMED_RECORD_PATCH,
	}).build();
	await Bun.write(
		paths.recordFile,
		`${JSON.stringify(record, null, RECORD_JSON_INDENT_SPACES)}\n`,
	);
	await Bun.write(
		join(paths.directory, "transcript.jsonl"),
		RESUMED_TRANSCRIPT,
	);

	return { caseId, runsDirectory, uuid };
}

const MISSING_TRANSCRIPT_PATCH = {
	metrics: {
		cacheReadTokens: 0,
		cacheWriteTokens: 251_695,
		costUsd: 1.008294,
		inputTokens: 2,
		outputTokens: 151,
		turns: 1,
	},
	transcriptDiagnostics: {
		issues: [],
		measuredLineCount: 23,
		prefixLinesExcluded: 1268,
		repeatedBashCommands: [],
		sourceLineCount: 1291,
		state: "complete",
		toolErrors: [],
		toolUseOccurrences: { byName: [], total: 0 },
	},
} satisfies Immutable<Partial<LegacySessionAttemptRecord>>;

type MissingAttemptEvidence = "transcript" | "boundary";

interface IncompleteAttemptFixture {
	readonly runsDirectory: string;
	readonly caseId: string;
	readonly uuid: string;
}

async function writtenIncompleteAttempt(
	missing: MissingAttemptEvidence,
): Promise<IncompleteAttemptFixture> {
	const runsDirectory = await historyRunsDirectory(
		missing === "transcript"
			? "rehearse-history-notranscript-"
			: "rehearse-history-noboundary-",
	);
	const { caseId, uuid } =
		missing === "transcript"
			? { caseId: "case-no-transcript", uuid: "attempt-no-transcript" }
			: { caseId: "case-no-boundary", uuid: "attempt-no-boundary" };
	const paths = sessionAttemptPaths(runsDirectory, { caseId, uuid });
	await mkdir(paths.directory, { recursive: true });
	const record = new SavedSessionRecordBuilder({
		caseId,
		...(missing === "transcript"
			? MISSING_TRANSCRIPT_PATCH
			: { transcriptDiagnostics: undefined }),
	}).build();
	await Bun.write(paths.recordFile, `${JSON.stringify(record)}\n`);
	if (missing === "boundary") {
		await Bun.write(
			join(paths.directory, "transcript.jsonl"),
			assistant("req-a", "claude-sonnet-5", {
				cacheWrite: 251_695,
				input: 2,
				output: 151,
			}),
		);
	}

	return { caseId, runsDirectory, uuid };
}

export {
	writtenIncompleteAttempt,
	assistant,
	writtenAttempt,
	writtenResumedAttempt,
};
