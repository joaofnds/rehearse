import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { SessionCase } from "./case";
import { statIfExists } from "./file-presence";
import type { Immutable } from "./contracts";
import { jsonValueSchema } from "./json-value";
import type { SessionAttemptId, SessionAttemptPaths } from "./run-layout";
import { orderedForHashing } from "./session-lineage";
import type { Check, CheckEvidence } from "./session-check";
import { evaluateChecks } from "./session-check";
import type { CheckKind } from "./session-check-result";
import { checkKindSchema } from "./session-check-result";
import type { SessionAttemptRecord } from "./session-record";
import type { StateResult } from "./session-state-check";
import { gradeStateEvidence, stateResultSchema } from "./session-state-check";
import { STATE_EVIDENCE_DIRECTORY } from "./session-state-evidence";
import { parseTranscriptFile, toolUses } from "./transcript";

/**
 * A regraded check carries a third status the recorded `checks` array cannot:
 * evidence the saved attempt does not hold is neither a pass nor a failure,
 * and recording it as either would put a grade on the record that nothing was
 * read to produce.
 */
export interface RegradedCheck {
	readonly kind: CheckKind;
	readonly status: "PASS" | "FAIL" | "UNAVAILABLE";
	readonly detail: string;
}

export interface RegradeRequest {
	readonly attemptId: Immutable<SessionAttemptId>;
	readonly record: Immutable<SessionAttemptRecord>;
	readonly attemptDirectory: string;
	readonly sessionCase: Immutable<SessionCase>;
}

/**
 * The bodies the grade was read from, digested so a later reader can tell
 * whether the assessment still describes the evidence beside it. A body the
 * attempt does not hold is absent rather than digested as empty: a digest of
 * nothing reads as a body that happened to be empty.
 */
export interface EvidenceDigests {
	readonly reply?: string | undefined;
	readonly transcript?: string | undefined;
}

export interface Assessment {
	/**
	 * The attempt this assessment read, as the two segments a
	 * `attempt:session:<case>/<uuid>` id carries. The id's text form is the
	 * CLI's vocabulary and is built where a reader is shown one; the record
	 * keeps the fields so it parses back without a parser.
	 */
	readonly sourceAttempt: Immutable<SessionAttemptId>;
	readonly gradingDefinition: string;
	readonly evidence: EvidenceDigests;
	readonly checks: readonly RegradedCheck[];
	/**
	 * Present only when the case declares a scorer and the scorer either could
	 * not run or had nothing to read. A case declaring no scorer grades no
	 * state, which is a different fact from evidence being absent, so it
	 * leaves both this and `stateResults` unset.
	 */
	readonly stateCheck?: Immutable<StateGradeProblem> | undefined;
	readonly stateResults?: readonly StateResult[] | undefined;
	/**
	 * Absent when any declared check was not graded. A verdict computed over
	 * the subset that had evidence would read as a grade of the whole
	 * definition, which is the fabricated grade the third status exists to
	 * prevent.
	 */
	readonly outcome?: "SUCCESSFUL" | "UNSUCCESSFUL" | undefined;
}

/**
 * Why a declared state scorer produced no results. `UNAVAILABLE` is the
 * attempt's fault, evidence it never preserved, and `ERROR` is the scorer's.
 * Neither is a failing grade, because neither says anything about the work
 * the session did.
 */
export interface StateGradeProblem {
	readonly status: "UNAVAILABLE" | "ERROR";
	readonly detail: string;
}

const regradedCheckSchema = z
	.object({
		kind: checkKindSchema,
		status: z.enum(["PASS", "FAIL", "UNAVAILABLE"]),
		detail: z.string().min(1),
	})
	.strict();

const stateGradeProblemSchema = z
	.object({
		status: z.enum(["UNAVAILABLE", "ERROR"]),
		detail: z.string().min(1),
	})
	.strict();

/**
 * An assessment is its own record, never a rewrite of `attempt.json`.
 * Comparison digests a rep's `attempt.json` bytes as provenance, so rewriting
 * the record would stale every saved comparison over that rep, and most saved
 * records are a schema version the writer can no longer emit, so rewriting
 * them in place would mean migrating evidence rather than reading it.
 */
export const assessmentSchema = z
	.object({
		schemaVersion: z.literal(1),
		sourceAttempt: z
			.object({ caseId: z.string().min(1), uuid: z.string().min(1) })
			.strict(),
		gradingDefinition: z.string().min(1),
		evidence: z
			.object({
				reply: z.string().min(1).optional(),
				transcript: z.string().min(1).optional(),
			})
			.strict(),
		checks: z.array(regradedCheckSchema),
		stateCheck: stateGradeProblemSchema.optional(),
		stateResults: z.array(stateResultSchema).optional(),
		outcome: z.enum(["SUCCESSFUL", "UNSUCCESSFUL"]).optional(),
	})
	.strict();

export function parseAssessment(text: string): Assessment {
	const { schemaVersion: _schemaVersion, ...assessment } =
		assessmentSchema.parse(JSON.parse(text));

	return assessment;
}

/**
 * Written under the timestamp of the pass that produced it, so a second pass
 * over the same attempt lands beside the first rather than over it and an
 * operator can read what the definition used to say.
 */
export async function writeAssessment(
	paths: Readonly<SessionAttemptPaths>,
	timestamp: string,
	assessment: Immutable<Assessment>,
): Promise<string> {
	const file = paths.gradeFile(timestamp);
	await mkdir(paths.gradesDirectory, { recursive: true });
	await Bun.write(
		file,
		`${JSON.stringify({ schemaVersion: 1, ...assessment }, null, 2)}\n`,
	);

	return file;
}

/**
 * The identity of the definition that produced an assessment, which nothing
 * else on a record carries. `sessionUpstreamDigest` hashes the transcript,
 * fixture, prompt, tools, settings, agents, project files and state scorer,
 * but not `checks`, so two cases differing only in a reply check share a
 * lineage and lineage cannot say which definition graded an attempt.
 *
 * The scorer's own bytes are deliberately not a component: they live inside
 * the fixture, which lineage already hashes whole, and every record carries a
 * lineage. `checks` is the one grading input nothing pins. Corpus, model and
 * effort stay out because they name the arm rather than the grader.
 */
export function gradingDefinitionDigest(
	sessionCase: Immutable<SessionCase>,
): string {
	const definition = jsonValueSchema.parse({
		checks: sessionCase.checks,
		stateCheck: sessionCase.stateCheck ?? null,
	});

	return createHash("sha256")
		.update(JSON.stringify(orderedForHashing(definition)))
		.digest("hex");
}

const NO_TRANSCRIPT_DETAIL =
	"the attempt recorded no readable transcript boundary, so its tool uses cannot be counted";

/**
 * Two of the four kinds read the reply the record saved and two read the
 * transcript on disk, so which evidence a check needs decides whether the
 * saved attempt can answer it at all.
 */
function readsTranscript(check: Immutable<Check>): boolean {
	return check.kind === "tool-calls" || check.kind === "files-read";
}

/**
 * The boundary comes from the record and never from the case, because an
 * operator who edits the case's cut would otherwise move the boundary of an
 * attempt already run. The gate is the diagnostics' `state`, not the presence
 * of `prefixLinesExcluded`: the `unavailable` variant carries that field too,
 * and one saved record pairs it with a zero-byte transcript, so a presence
 * rule would slice nothing at 0 and report a tool-calls check passing over
 * evidence that does not exist.
 */
function recordedBoundary(
	record: Immutable<SessionAttemptRecord>,
): number | undefined {
	const diagnostics = record.transcriptDiagnostics;
	if (diagnostics === undefined || diagnostics.state === "unavailable") {
		return undefined;
	}

	return diagnostics.prefixLinesExcluded;
}

interface ReadEvidence {
	readonly evidence: CheckEvidence;
	readonly digests: EvidenceDigests;
}

function sha256Of(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}

/**
 * The digest covers the body as it sits on disk, taken from the same read the
 * grade used, so an assessment cannot name a digest of bytes other than the
 * ones it graded.
 */
async function savedEvidence(
	request: Immutable<RegradeRequest>,
	boundary: number | undefined,
): Promise<ReadEvidence> {
	const { reply } = request.record;
	const replyDigest = reply === undefined ? undefined : sha256Of(reply);
	if (boundary === undefined) {
		return {
			evidence: { reply: reply ?? "", toolUses: [] },
			digests: { reply: replyDigest },
		};
	}

	const file = join(request.attemptDirectory, request.record.transcriptFile);
	const lines = await parseTranscriptFile(file);

	return {
		evidence: { reply: reply ?? "", toolUses: toolUses(lines.slice(boundary)) },
		digests: {
			reply: replyDigest,
			transcript: sha256Of(await Bun.file(file).text()),
		},
	};
}

interface StateGrade {
	readonly stateCheck?: StateGradeProblem | undefined;
	readonly stateResults?: readonly StateResult[] | undefined;
}

const NO_STATE_EVIDENCE_DETAIL =
	"the attempt preserved no files or git state, so its state scorer has nothing to grade";

/**
 * The grade runs against a fresh restore of the preserved tree rather than
 * against the tree itself, which is what lets a second pass read the same
 * bytes the first did even when the scorer writes.
 *
 * An attempt saved before retention existed has no `state/` beside it. That
 * is evidence the attempt never preserved, not a scorer that failed, so it is
 * reported as unavailable rather than run against an empty directory, which
 * would grade the absence of the session's work as the session's work.
 */
async function regradeState(
	request: Immutable<RegradeRequest>,
): Promise<StateGrade> {
	const { stateCheck } = request.sessionCase;
	if (stateCheck === undefined) {
		return {};
	}

	const evidenceDirectory = join(
		request.attemptDirectory,
		STATE_EVIDENCE_DIRECTORY,
	);
	const preserved = await statIfExists(evidenceDirectory);
	if (preserved === undefined) {
		return {
			stateCheck: {
				status: "UNAVAILABLE",
				detail: NO_STATE_EVIDENCE_DETAIL,
			},
		};
	}

	const restoreDirectory = await mkdtemp(join(tmpdir(), "rehearse-regrade-"));
	try {
		const graded = await gradeStateEvidence({
			evidenceDirectory,
			restoreDirectory,
			scorerSource: request.sessionCase.fixturePath,
			command: stateCheck.command,
			outcomes: stateCheck.outcomes,
		});

		return graded.kind === "results"
			? { stateResults: graded.results }
			: { stateCheck: { status: "ERROR", detail: graded.detail } };
	} finally {
		await rm(restoreDirectory, { force: true, recursive: true });
	}
}

/**
 * A grade over a subset of the declared checks is not a grade of the
 * definition, so the verdict is withheld entirely rather than computed over
 * whatever had evidence.
 */
function verdictOver(
	checks: readonly RegradedCheck[],
	state: Readonly<StateGrade>,
): Assessment["outcome"] {
	if (
		state.stateCheck !== undefined ||
		checks.some(({ status }) => status === "UNAVAILABLE")
	) {
		return undefined;
	}

	const passed = [...checks, ...(state.stateResults ?? [])].every(
		({ status }) => status === "PASS",
	);

	return passed ? "SUCCESSFUL" : "UNSUCCESSFUL";
}

function unavailable(check: Immutable<Check>): RegradedCheck {
	return {
		kind: check.kind,
		status: "UNAVAILABLE",
		detail: NO_TRANSCRIPT_DETAIL,
	};
}

/**
 * A check whose evidence the attempt does not hold is set aside before
 * grading rather than graded and overwritten, so `evaluateChecks` is handed
 * only checks the evidence can answer and the algorithm that graded the
 * original attempt is the one that regrades it. The two lists are re-joined
 * on the position each check holds in the case's declaration, which is what
 * keeps a case declaring the same check twice from collapsing into one.
 */
export async function regradeAttempt(
	request: Immutable<RegradeRequest>,
): Promise<Assessment> {
	const boundary = recordedBoundary(request.record);
	const gradable = request.sessionCase.checks
		.map((check, position) => ({ check, position }))
		.filter(({ check }) => boundary !== undefined || !readsTranscript(check));

	const { evidence, digests } = await savedEvidence(request, boundary);
	const graded = evaluateChecks(
		gradable.map(({ check }) => check),
		evidence,
	);
	const byPosition = new Map(
		gradable.map(({ position }, index) => [position, graded.results[index]]),
	);

	const checks = request.sessionCase.checks.map(
		(check, position) => byPosition.get(position) ?? unavailable(check),
	);
	const state = await regradeState(request);

	return {
		sourceAttempt: request.attemptId,
		gradingDefinition: gradingDefinitionDigest(request.sessionCase),
		evidence: digests,
		checks,
		...state,
		outcome: verdictOver(checks, state),
	};
}
