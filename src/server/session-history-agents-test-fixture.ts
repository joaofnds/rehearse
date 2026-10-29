import { join } from "node:path";

import { sessionAttemptPaths } from "#benchmark/run-layout";
import { sessionAttemptRecordSchema } from "#benchmark/session-record";
import RECORD_JSON_INDENT_SPACES from "#server/json-record-format";
import SavedSessionRecordBuilder from "#server/saved-session-record-test-builder";
import { writtenAttempt } from "#server/session-history-attempt-test-fixture";
import { historyRunsDirectory } from "#server/session-history-workspace-test-fixture";

const AGENT_TREE_FIXTURE = join(
	import.meta.dir,
	"..",
	"benchmark",
	"__fixtures__",
	"agent-tree",
);

async function writtenAgentTreeAttempt(): Promise<{
	readonly runsDirectory: string;
	readonly caseId: string;
	readonly uuid: string;
	readonly directory: string;
}> {
	const fixture = await writtenAttempt();
	const { directory } = sessionAttemptPaths(fixture.runsDirectory, {
		caseId: fixture.caseId,
		uuid: fixture.uuid,
	});
	const record = sessionAttemptRecordSchema.parse(
		await Bun.file(join(directory, "attempt.json")).json(),
	);
	await Bun.write(
		join(directory, "attempt.json"),
		`${JSON.stringify(
			{
				...record,
				transcriptDiagnostics: {
					...record.transcriptDiagnostics,
					prefixLinesExcluded: 3,
				},
			},
			null,
			RECORD_JSON_INDENT_SPACES,
		)}\n`,
	);
	await Bun.write(
		join(directory, "transcript.jsonl"),
		Bun.file(join(AGENT_TREE_FIXTURE, "transcript.jsonl")),
	);
	await Array.fromAsync(
		["a0", "a1", "a2", "a3", "a5"].flatMap((id) => [
			`agent-${id}.jsonl`,
			`agent-${id}.meta.json`,
		]),
		async (name) => {
			await Bun.write(
				join(directory, "subagents", name),
				Bun.file(join(AGENT_TREE_FIXTURE, "subagents", name)),
			);
		},
	);

	return { ...fixture, directory };
}

const ONE_SUBAGENT_FIXTURE = join(
	import.meta.dir,
	"..",
	"benchmark",
	"__fixtures__",
	"one-subagent",
);

const ONE_SUBAGENT_FILES = [
	"transcript.jsonl",
	"subagents/agent-k1.jsonl",
	"subagents/agent-k1.meta.json",
];

/**
 * The root's two requests cost $0.75 and $0.50 at claude-sonnet-5's rates,
 * and its sub-agent's one request $0.375.
 */
const ROOT_AND_SUBAGENT_COST_USD = 1.625;

/**
 * A saved attempt whose root launched one sub-agent and kept its transcript,
 * with a provider cost equal to both agents' calculated cost.
 */
async function writtenSubagentAttempt(): Promise<{
	readonly runsDirectory: string;
	readonly caseId: string;
	readonly uuid: string;
}> {
	const runsDirectory = await historyRunsDirectory(
		"rehearse-history-subagent-",
	);
	const identity = { caseId: "case-subagent", uuid: "attempt-subagent" };
	const paths = sessionAttemptPaths(runsDirectory, identity);
	const record = new SavedSessionRecordBuilder({
		caseId: identity.caseId,
		metrics: {
			cacheReadTokens: 0,
			cacheWriteTokens: 0,
			costUsd: ROOT_AND_SUBAGENT_COST_USD,
			inputTokens: 625_000,
			outputTokens: 37_500,
			turns: 2,
		},
	}).build();

	await Bun.write(
		paths.recordFile,
		`${JSON.stringify(record, null, RECORD_JSON_INDENT_SPACES)}\n`,
	);
	await Array.fromAsync(ONE_SUBAGENT_FILES, async (name) => {
		await Bun.write(
			join(paths.directory, name),
			Bun.file(join(ONE_SUBAGENT_FIXTURE, name)),
		);
	});

	return { ...identity, runsDirectory };
}

export { AGENT_TREE_FIXTURE, writtenAgentTreeAttempt, writtenSubagentAttempt };
