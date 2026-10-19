import type { Immutable } from "#benchmark/contracts";
import type { SessionAttemptRecord } from "#benchmark/session-record";
import { sessionAttemptRecordSchema } from "#benchmark/session-record";

const CORPUS_DIGEST =
	"1a1dc91c907325c69271ddf0c944bc72f8ac74ef5d63e8ac2e5f10c0f0f1f1f1";
class RegradeRecordBuilder {
	readonly #fields: Immutable<Partial<SessionAttemptRecord>>;
	public constructor(fields: Immutable<Partial<SessionAttemptRecord>> = {}) {
		this.#fields = fields;
	}
	public build(): SessionAttemptRecord {
		const fields = this.#fields;
		return sessionAttemptRecordSchema.parse({
			caseId: "smoke",
			checks: [{ detail: "0 tool calls", kind: "tool-calls", status: "PASS" }],
			corpusFiles: [
				{
					path: "CLAUDE.md",
					resolvedPath: "/corpus/CLAUDE.md",
					sha256: CORPUS_DIGEST,
				},
			],
			elapsedMs: 1000,
			lineage: "session-lineage",
			model: "sonnet",
			outcome: "SUCCESSFUL",
			prompt: "write the reply",
			reply: "the reply",
			schemaVersion: 3,
			sessionBudgetUsd: 2,
			transcriptDiagnostics: { prefixLinesExcluded: 0, state: "unavailable" },
			transcriptFile: "transcript.jsonl",
			...fields,
		});
	}
	public static completeBoundary({
		prefixLinesExcluded,
	}: CompleteBoundaryFixtureInput): SessionAttemptRecord["transcriptDiagnostics"] {
		return {
			issues: [],
			measuredLineCount: 0,
			prefixLinesExcluded,
			repeatedBashCommands: [],
			sourceLineCount: 0,
			state: "complete",
			toolErrors: [],
			toolUseOccurrences: { byName: [], total: 0 },
		};
	}
}
interface CompleteBoundaryFixtureInput {
	readonly prefixLinesExcluded: number;
}
export default RegradeRecordBuilder;
