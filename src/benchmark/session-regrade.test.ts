import { describe, expect, it } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SessionCase } from "#benchmark/case";
import type { Immutable } from "#benchmark/contracts";
import { TestResources } from "#benchmark/test-support";
import {
	gradingDefinitionDigest,
	regradeAttempt,
} from "#benchmark/session-regrade";
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

function sha256Of(text: string): string {
	return new Bun.CryptoHasher("sha256").update(text).digest("hex");
}

async function attemptWithTranscript(
	tools: readonly string[],
): Promise<string> {
	const directory = await attemptDirectory();
	await Bun.write(
		join(directory, "transcript.jsonl"),
		tools.map((name) => `${toolUseLine(name)}\n`).join(""),
	);

	return directory;
}

function toolUseLine(name: string): string {
	return JSON.stringify({
		type: "assistant",
		message: {
			content: [{ type: "tool_use", name, input: {} }],
		},
	});
}

/**
 * The diagnostics a grading pass writes when it read the whole transcript,
 * which is the state a regrade needs before it may slice at the boundary.
 */
function completeBoundary(
	prefixLinesExcluded: number,
): SessionAttemptRecord["transcriptDiagnostics"] {
	return {
		state: "complete",
		prefixLinesExcluded,
		sourceLineCount: 0,
		measuredLineCount: 0,
		toolUseOccurrences: { total: 0, byName: [] },
		toolErrors: [],
		repeatedBashCommands: [],
		issues: [],
	};
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

describe(gradingDefinitionDigest.name, () => {
	it("differs when the case declares a different check", () => {
		const one = gradingDefinitionDigest(
			caseDeclaring([{ kind: "word-band", max: 2 }]),
		);
		const other = gradingDefinitionDigest(
			caseDeclaring([{ kind: "word-band", max: 3 }]),
		);

		expect(one).not.toEqual(other);
	});

	it("differs when the case declares a different state scorer", () => {
		const one = gradingDefinitionDigest({
			...caseDeclaring([]),
			stateCheck: { command: ["./score"], outcomes: ["clean"] },
		});
		const other = gradingDefinitionDigest({
			...caseDeclaring([]),
			stateCheck: { command: ["./score", "--strict"], outcomes: ["clean"] },
		});

		expect(one).not.toEqual(other);
	});

	it("is unchanged by the key order a check was written in", () => {
		const one = caseDeclaring([{ kind: "word-band", min: 1, max: 2 }]);
		const other = caseDeclaring([{ kind: "word-band", max: 2, min: 1 }]);

		expect(gradingDefinitionDigest(one)).toEqual(
			gradingDefinitionDigest(other),
		);
	});

	it("is unchanged by a prompt the grading definition does not cover", () => {
		const checks = caseDeclaring([{ kind: "word-band", max: 2 }]);

		expect(gradingDefinitionDigest({ ...checks, prompt: "another" })).toEqual(
			gradingDefinitionDigest(checks),
		);
	});
});

describe(regradeAttempt.name, () => {
	it("names the attempt it read and the definition that graded it", async () => {
		const directory = await attemptWithTranscript(["Bash"]);
		const sessionCase = caseDeclaring([{ kind: "word-band", max: 2 }]);

		const assessment = await regradeAttempt({
			attemptId: { caseId: "smoke", uuid: "attempt-uuid" },
			record: savedRecord({ transcriptDiagnostics: completeBoundary(0) }),
			attemptDirectory: directory,
			sessionCase,
		});

		expect(assessment.sourceAttempt).toEqual({
			caseId: "smoke",
			uuid: "attempt-uuid",
		});
		expect(assessment.gradingDefinition).toBe(
			gradingDefinitionDigest(sessionCase),
		);
	});

	it("digests each evidence body it read", async () => {
		const directory = await attemptWithTranscript(["Bash"]);

		const assessment = await regradeAttempt({
			attemptId: { caseId: "smoke", uuid: "attempt-uuid" },
			record: savedRecord({
				reply: "the reply",
				transcriptDiagnostics: completeBoundary(0),
			}),
			attemptDirectory: directory,
			sessionCase: caseDeclaring([{ kind: "word-band", max: 2 }]),
		});

		expect(assessment.evidence).toEqual({
			reply: sha256Of("the reply"),
			transcript: sha256Of(`${toolUseLine("Bash")}\n`),
		});
	});

	it("reports a verdict when every declared check was graded", async () => {
		const directory = await attemptWithTranscript(["Bash"]);

		const assessment = await regradeAttempt({
			attemptId: { caseId: "smoke", uuid: "attempt-uuid" },
			record: savedRecord({
				reply: "one",
				transcriptDiagnostics: completeBoundary(0),
			}),
			attemptDirectory: directory,
			sessionCase: caseDeclaring([{ kind: "word-band", max: 2 }]),
		});

		expect(assessment.outcome).toBe("SUCCESSFUL");
	});

	it("withholds a verdict when a declared check could not be graded", async () => {
		const directory = await attemptDirectory();

		const assessment = await regradeAttempt({
			attemptId: { caseId: "smoke", uuid: "attempt-uuid" },
			record: savedRecord({ reply: "one" }),
			attemptDirectory: directory,
			sessionCase: caseDeclaring([
				{ kind: "word-band", max: 2 },
				{ kind: "tool-calls", max: 0 },
			]),
		});

		expect(assessment.outcome).toBeUndefined();
	});

	it("grades a reply check against the saved reply", async () => {
		const directory = await attemptDirectory();

		const assessment = await regradeAttempt({
			attemptId: { caseId: "smoke", uuid: "attempt-uuid" },
			record: savedRecord({ reply: "one two three" }),
			attemptDirectory: directory,
			sessionCase: caseDeclaring([{ kind: "word-band", max: 2 }]),
		});

		expect(assessment.checks).toEqual([
			{
				kind: "word-band",
				status: "FAIL",
				detail: "3 words outside at most 2",
			},
		]);
	});

	it("ignores a forbidden tool the attempt's transcript prefix carries", async () => {
		const directory = await attemptWithTranscript(["Read", "Bash"]);

		const assessment = await regradeAttempt({
			attemptId: { caseId: "smoke", uuid: "attempt-uuid" },
			record: savedRecord({ transcriptDiagnostics: completeBoundary(1) }),
			attemptDirectory: directory,
			sessionCase: caseDeclaring([{ kind: "tool-calls", names: ["Bash"] }]),
		});

		expect(assessment.checks).toEqual([
			{ kind: "tool-calls", status: "PASS", detail: "1 tool calls" },
		]);
	});

	it("counts a forbidden tool called after the boundary", async () => {
		const directory = await attemptWithTranscript(["Bash", "Read"]);

		const assessment = await regradeAttempt({
			attemptId: { caseId: "smoke", uuid: "attempt-uuid" },
			record: savedRecord({ transcriptDiagnostics: completeBoundary(1) }),
			attemptDirectory: directory,
			sessionCase: caseDeclaring([{ kind: "tool-calls", names: ["Bash"] }]),
		});

		expect(assessment.checks).toEqual([
			{
				kind: "tool-calls",
				status: "FAIL",
				detail: "undeclared tool called: Read",
			},
		]);
	});

	describe("when the record carries no transcript diagnostics", () => {
		it("reports a transcript check unavailable and still grades the reply", async () => {
			const directory = await attemptWithTranscript(["Read"]);

			const assessment = await regradeAttempt({
				attemptId: { caseId: "smoke", uuid: "attempt-uuid" },
				record: savedRecord({
					reply: "one two three",
					transcriptDiagnostics: undefined,
				}),
				attemptDirectory: directory,
				sessionCase: caseDeclaring([
					{ kind: "tool-calls", names: ["Bash"] },
					{ kind: "word-band", max: 2 },
				]),
			});

			expect(assessment.checks).toEqual([
				{
					kind: "tool-calls",
					status: "UNAVAILABLE",
					detail:
						"the attempt recorded no readable transcript boundary, so its tool uses cannot be counted",
				},
				{
					kind: "word-band",
					status: "FAIL",
					detail: "3 words outside at most 2",
				},
			]);
		});
	});

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
						"the attempt recorded no readable transcript boundary, so its tool uses cannot be counted",
				},
			]);
		});
	});
});
