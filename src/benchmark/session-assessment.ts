import { mkdir } from "node:fs/promises";

import { z } from "zod";

import type { Immutable } from "./contracts";
import type { SessionAttemptId, SessionAttemptPaths } from "./run-layout";
import type { CheckKind } from "./session-check-result";
import { checkKindSchema } from "./session-check-result";
import type { StateResult } from "./session-state-check";
import { stateResultSchema } from "./session-state-check";

const JSON_INDENTATION_SPACES = 2;

const SESSION_ASSESSMENT_SCHEMA_VERSION = 1;

/**
 * A regraded check carries a third status the recorded `checks` array cannot:
 * evidence the saved attempt does not hold is neither a pass nor a failure,
 * and recording it as either would put a grade on the record that nothing was
 * read to produce.
 */
interface RegradedCheck {
	readonly kind: CheckKind;
	readonly status: "PASS" | "FAIL" | "UNAVAILABLE";
	readonly detail: string;
}

/**
 * The bodies the grade was read from, digested so a later reader can tell
 * whether the assessment still describes the evidence beside it. A body the
 * attempt does not hold is absent rather than digested as empty: a digest of
 * nothing reads as a body that happened to be empty.
 */
interface EvidenceDigests {
	readonly reply?: string | undefined;
	readonly transcript?: string | undefined;
}

interface Assessment {
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
interface StateGradeProblem {
	readonly status: "UNAVAILABLE" | "ERROR";
	readonly detail: string;
}

const regradedCheckSchema = z
	.object({
		detail: z.string().nonempty(),
		kind: checkKindSchema,
		status: z.enum(["PASS", "FAIL", "UNAVAILABLE"]),
	})
	.strict();

const stateGradeProblemSchema = z
	.object({
		detail: z.string().nonempty(),
		status: z.enum(["UNAVAILABLE", "ERROR"]),
	})
	.strict();

/**
 * An assessment is its own record, never a rewrite of `attempt.json`.
 * Comparison digests a rep's `attempt.json` bytes as provenance, so rewriting
 * the record would stale every saved comparison over that rep, and most saved
 * records are a schema version the writer can no longer emit, so rewriting
 * them in place would mean migrating evidence rather than reading it.
 */
const assessmentSchema = z
	.object({
		checks: z.array(regradedCheckSchema),
		evidence: z
			.object({
				reply: z.string().nonempty().optional(),
				transcript: z.string().nonempty().optional(),
			})
			.strict(),
		gradingDefinition: z.string().nonempty(),
		outcome: z.enum(["SUCCESSFUL", "UNSUCCESSFUL"]).optional(),
		schemaVersion: z.literal(SESSION_ASSESSMENT_SCHEMA_VERSION),
		sourceAttempt: z
			.object({ caseId: z.string().nonempty(), uuid: z.string().nonempty() })
			.strict(),
		stateCheck: stateGradeProblemSchema.optional(),
		stateResults: z.array(stateResultSchema).optional(),
	})
	.strict();

function parseAssessment(text: string): Assessment {
	const { schemaVersion: _schemaVersion, ...assessment } =
		assessmentSchema.parse(JSON.parse(text));

	return assessment;
}

/**
 * Written under the timestamp of the pass that produced it, so a second pass
 * over the same attempt lands beside the first rather than over it and an
 * operator can read what the definition used to say.
 */
async function writeAssessment(
	paths: Readonly<SessionAttemptPaths>,
	timestamp: string,
	assessment: Immutable<Assessment>,
): Promise<string> {
	const file = paths.gradeFile(timestamp);
	await mkdir(paths.gradesDirectory, { recursive: true });
	await Bun.write(
		file,
		`${JSON.stringify({ schemaVersion: SESSION_ASSESSMENT_SCHEMA_VERSION, ...assessment }, null, JSON_INDENTATION_SPACES)}\n`,
	);

	return file;
}
export { assessmentSchema, parseAssessment, writeAssessment };
export type { RegradedCheck, EvidenceDigests, Assessment, StateGradeProblem };
