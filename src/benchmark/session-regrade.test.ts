import { describe, expect, it } from "bun:test";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import type { SessionCase } from "#benchmark/case";
import type { Immutable } from "#benchmark/contracts";
import { STATE_EVIDENCE_DIRECTORY } from "#benchmark/session-state-evidence";
import { TestResources } from "#benchmark/test-support";
import type { SessionAttemptPaths } from "#benchmark/run-layout";
import { sessionAttemptPaths } from "#benchmark/run-layout";
import type { Assessment, RegradedCheck } from "#benchmark/session-regrade";
import {
	gradingDefinitionDigest,
	parseAssessment,
	regradeAttempt,
	writeAssessment,
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

/**
 * The two evidence paths a regrade reads, for an attempt directory a test
 * built directly rather than under a runs directory.
 */
function pathsFor(
	directory: string,
): Pick<SessionAttemptPaths, "directory" | "transcriptFile"> {
	return {
		directory,
		transcriptFile: join(directory, "transcript.jsonl"),
	};
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

/**
 * An attempt whose `state/` directory holds one file, which is the shape
 * retention leaves behind: the session's tree copied beside the record.
 */
async function attemptWithStateEvidence(contents: string): Promise<string> {
	const directory = await attemptWithTranscript(["Bash"]);
	await Bun.write(
		join(directory, STATE_EVIDENCE_DIRECTORY, "left.txt"),
		contents,
	);

	return directory;
}

interface ScorerBehavior {
	/**
	 * A scorer that rewrites and deletes the evidence it grades, which is what
	 * makes "the second pass reads the bytes the first did" an observation
	 * rather than an assumption.
	 */
	readonly writes?: boolean;
}

/**
 * A scorer reporting one outcome named after the file the session left, so a
 * grade over the restored copy is visible without a provider.
 */
function caseScoringState(
	behavior: Readonly<ScorerBehavior> = {},
): SessionCase {
	const declared = caseDeclaring([]);
	const report = String.raw`printf '{"results":[{"name":"left-a-file","status":"PASS","detail":"%s"}]}' "$(tr -d '\n' < left.txt)"`;
	const stateCheck = {
		command: [
			"sh",
			"-c",
			behavior.writes === true
				? `${report}; printf overwritten > left.txt; printf planted > planted.txt`
				: report,
		],
		outcomes: ["left-a-file"],
	};

	return {
		...declared,
		declaration: { ...declared.declaration, stateCheck },
		stateCheck,
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

/**
 * The three evidence bodies hashed by name rather than by hashing the attempt
 * directory, which necessarily changes: the assessments land inside it.
 */
async function evidenceDigests(
	attempt: string,
): Promise<Record<string, string>> {
	const entries = await readdir(join(attempt, "state"), {
		recursive: true,
		withFileTypes: true,
	});
	const state = entries
		.filter((entry) => entry.isFile())
		.map((entry) => join(entry.parentPath, entry.name));

	const named = [
		join(attempt, "attempt.json"),
		join(attempt, "transcript.jsonl"),
		...state,
	];
	const digests: Record<string, string> = {};
	for (const path of named) {
		digests[relative(attempt, path)] = sha256Of(await Bun.file(path).text());
	}

	return digests;
}

function assessmentOf(
	check: Immutable<Omit<RegradedCheck, "kind">>,
): Assessment {
	return {
		sourceAttempt: { caseId: "smoke", uuid: "uuid-1" },
		gradingDefinition: sha256Of("a definition"),
		evidence: { reply: sha256Of("the reply") },
		checks: [{ kind: "word-band", ...check }],
		outcome: check.status === "PASS" ? "SUCCESSFUL" : "UNSUCCESSFUL",
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

describe(writeAssessment.name, () => {
	it("files the assessment under the pass's timestamp inside the attempt", async () => {
		const runsDirectory = await attemptDirectory();
		const paths = sessionAttemptPaths(runsDirectory, {
			caseId: "smoke",
			uuid: "uuid-1",
		});

		const written = await writeAssessment(
			paths,
			"2026-09-20T12:00:00.000Z",
			assessmentOf({ status: "PASS", detail: "3 words" }),
		);

		expect(written).toBe(paths.gradeFile("2026-09-20T12:00:00.000Z"));
		expect(parseAssessment(await Bun.file(written).text())).toEqual(
			assessmentOf({ status: "PASS", detail: "3 words" }),
		);
	});

	it("keeps an earlier pass's assessment beside a later one", async () => {
		const runsDirectory = await attemptDirectory();
		const paths = sessionAttemptPaths(runsDirectory, {
			caseId: "smoke",
			uuid: "uuid-1",
		});

		await writeAssessment(
			paths,
			"2026-09-20T12:00:00.000Z",
			assessmentOf({ status: "PASS", detail: "3 words" }),
		);
		await writeAssessment(
			paths,
			"2026-09-20T13:00:00.000Z",
			assessmentOf({ status: "FAIL", detail: "9 words" }),
		);

		const filed = await readdir(paths.gradesDirectory);

		expect(filed.toSorted((one, other) => one.localeCompare(other))).toEqual([
			"2026-09-20T12-00-00.000Z.json",
			"2026-09-20T13-00-00.000Z.json",
		]);
	});
});

describe(regradeAttempt.name, () => {
	it("names the attempt it read and the definition that graded it", async () => {
		const directory = await attemptWithTranscript(["Bash"]);
		const sessionCase = caseDeclaring([{ kind: "word-band", max: 2 }]);

		const assessment = await regradeAttempt({
			attemptId: { caseId: "smoke", uuid: "attempt-uuid" },
			record: savedRecord({ transcriptDiagnostics: completeBoundary(0) }),
			paths: pathsFor(directory),
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
			paths: pathsFor(directory),
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
			paths: pathsFor(directory),
			sessionCase: caseDeclaring([{ kind: "word-band", max: 2 }]),
		});

		expect(assessment.outcome).toBe("SUCCESSFUL");
	});

	it("withholds a verdict when a declared check could not be graded", async () => {
		const directory = await attemptDirectory();

		const assessment = await regradeAttempt({
			attemptId: { caseId: "smoke", uuid: "attempt-uuid" },
			record: savedRecord({ reply: "one" }),
			paths: pathsFor(directory),
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
			paths: pathsFor(directory),
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

	it("reads the transcript beside the attempt, not the path the record recorded", async () => {
		const directory = await attemptWithTranscript(["Read"]);

		const assessment = await regradeAttempt({
			attemptId: { caseId: "smoke", uuid: "attempt-uuid" },
			record: savedRecord({
				transcriptFile: "/gone/on/another/machine/transcript.jsonl",
				transcriptDiagnostics: completeBoundary(0),
			}),
			paths: pathsFor(directory),
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

	it("ignores a forbidden tool the attempt's transcript prefix carries", async () => {
		const directory = await attemptWithTranscript(["Read", "Bash"]);

		const assessment = await regradeAttempt({
			attemptId: { caseId: "smoke", uuid: "attempt-uuid" },
			record: savedRecord({ transcriptDiagnostics: completeBoundary(1) }),
			paths: pathsFor(directory),
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
			paths: pathsFor(directory),
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

	it("leaves the attempt's own evidence byte-identical across two passes", async () => {
		const directory = await attemptWithStateEvidence("left-behind\n");
		await Bun.write(join(directory, "attempt.json"), "{}\n");
		const request = {
			attemptId: { caseId: "smoke", uuid: "attempt-uuid" },
			record: savedRecord({ transcriptDiagnostics: completeBoundary(0) }),
			paths: pathsFor(directory),
			sessionCase: caseScoringState({ writes: true }),
		};
		const before = await evidenceDigests(directory);

		await regradeAttempt(request);
		await regradeAttempt(request);

		expect(await evidenceDigests(directory)).toEqual(before);
	});

	describe("when the case declares a state scorer", () => {
		it("grades the state the attempt preserved", async () => {
			const directory = await attemptWithStateEvidence("left-behind\n");

			const assessment = await regradeAttempt({
				attemptId: { caseId: "smoke", uuid: "attempt-uuid" },
				record: savedRecord({ transcriptDiagnostics: completeBoundary(0) }),
				paths: pathsFor(directory),
				sessionCase: caseScoringState(),
			});

			expect(assessment.stateResults).toEqual([
				{ name: "left-a-file", status: "PASS", detail: "left-behind" },
			]);
		});

		it("reports the state check unavailable when the attempt preserved none", async () => {
			const directory = await attemptWithTranscript(["Bash"]);

			const assessment = await regradeAttempt({
				attemptId: { caseId: "smoke", uuid: "attempt-uuid" },
				record: savedRecord({ transcriptDiagnostics: completeBoundary(0) }),
				paths: pathsFor(directory),
				sessionCase: caseScoringState(),
			});

			expect(assessment.stateCheck).toEqual({
				status: "UNAVAILABLE",
				detail:
					"the attempt preserved no files or git state, so its state scorer has nothing to grade",
			});
			expect(assessment.stateResults).toBeUndefined();
			expect(assessment.outcome).toBeUndefined();
		});
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
				paths: pathsFor(directory),
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
				paths: pathsFor(directory),
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
