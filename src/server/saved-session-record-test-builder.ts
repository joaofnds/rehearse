import type { Immutable } from "#benchmark/contracts";
import type { LegacySessionAttemptRecord } from "#benchmark/session-record";
import { legacySessionAttemptRecordSchema } from "#benchmark/session-record";

const BASE_SESSION_RECORD = {
	checks: [{ detail: "1 word", kind: "word-band", status: "PASS" }],
	corpusFiles: [],
	elapsedMs: 1,
	lineage: "lineage-a",
	model: "sonnet",
	outcome: "SUCCESSFUL",
	prompt: "inspect",
	reply: "done",
	schemaVersion: 1,
	sessionBudgetUsd: 1,
	transcriptDiagnostics: {
		issues: [],
		measuredLineCount: 2,
		prefixLinesExcluded: 0,
		repeatedBashCommands: [],
		sourceLineCount: 2,
		state: "complete",
		toolErrors: [],
		toolUseOccurrences: {
			byName: [{ count: 1, name: "Read" }],
			total: 1,
		},
	},
	transcriptFile: "/outside/must-not-be-read.jsonl",
};

class SavedSessionRecordBuilder {
	public constructor(
		private readonly props: Immutable<Partial<LegacySessionAttemptRecord>> = {},
	) {}

	public build(): LegacySessionAttemptRecord {
		return legacySessionAttemptRecordSchema.parse({
			...BASE_SESSION_RECORD,
			caseId: "case-a",
			...this.props,
		});
	}
}

export { SavedSessionRecordBuilder as default };
