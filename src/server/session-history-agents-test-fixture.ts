import { join } from "node:path";

import { sessionAttemptPaths } from "#benchmark/run-layout";
import { sessionAttemptRecordSchema } from "#benchmark/session-record";
import RECORD_JSON_INDENT_SPACES from "#server/json-record-format";
import { writtenAttempt } from "#server/session-history-attempt-test-fixture";

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

export { AGENT_TREE_FIXTURE, writtenAgentTreeAttempt };
