import { describe, expect, it } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SessionCase } from "#benchmark/case";
import type { Immutable } from "#benchmark/contracts";
import { TestResources } from "#benchmark/test-support";
import { regradeAttempt } from "#benchmark/session-regrade";
import type { SessionAttemptRecord } from "#benchmark/session-record";
import { sessionAttemptRecordSchema } from "#benchmark/session-record";

const resources = TestResources.forEachTest();

const CORPUS_DIGEST =
	"1a1dc91c907325c69271ddf0c944bc72f8ac74ef5d63e8ac2e5f10c0f0f1f1f1";

async function attemptDirectory(): Promise<string> {
	const path = await mkdtemp(join(tmpdir(), "rehearse-regrade-"));
	resources.track(path);

	return path;
}

function savedRecord(
	fields: Immutable<Partial<SessionAttemptRecord>> = {},
): SessionAttemptRecord {
	return sessionAttemptRecordSchema.parse({
		schemaVersion: 3,
		caseId: "smoke",
		lineage: "session-lineage",
		model: "sonnet",
		sessionBudgetUsd: 2,
		corpusFiles: [
			{
				path: "CLAUDE.md",
				resolvedPath: "/corpus/CLAUDE.md",
				sha256: CORPUS_DIGEST,
			},
		],
		prompt: "write the reply",
		reply: "the reply",
		transcriptFile: "transcript.jsonl",
		transcriptDiagnostics: { state: "unavailable", prefixLinesExcluded: 0 },
		outcome: "SUCCESSFUL",
		checks: [{ kind: "tool-calls", status: "PASS", detail: "0 tool calls" }],
		elapsedMs: 1000,
		...fields,
	});
}

function caseDeclaring(checks: SessionCase["checks"]): SessionCase {
	return {
		kind: "session",
		declaration: {
			kind: "session",
			id: "smoke",
			title: "smoke",
			prompt: "write the reply",
			tools: [],
			corpusFiles: ["CLAUDE.md"],
			projectFiles: [],
			checks,
		},
		fixturePath: undefined,
		transcriptPath: undefined,
		prompt: "write the reply",
		tools: [],
		settings: undefined,
		agents: undefined,
		corpusFiles: ["CLAUDE.md"],
		projectFiles: [],
		checks,
	};
}

describe(regradeAttempt.name, () => {
	describe("when the record's transcript is unavailable", () => {
		it("reports a transcript check unavailable rather than grading an absent transcript", async () => {
			const directory = await attemptDirectory();

			const assessment = await regradeAttempt({
				attemptId: { caseId: "smoke", uuid: "attempt-uuid" },
				record: savedRecord(),
				attemptDirectory: directory,
				sessionCase: caseDeclaring([{ kind: "tool-calls", max: 0 }]),
			});

			expect(assessment.checks).toEqual([
				{
					kind: "tool-calls",
					status: "UNAVAILABLE",
					detail:
						"the attempt recorded no readable transcript, so its tool uses cannot be counted",
				},
			]);
		});
	});
});
