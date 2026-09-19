import { z } from "zod";
import { CommandError } from "./command";
import {
	restoreStateEvidence,
	runAgainstStateEvidence,
} from "./session-state-evidence";

/**
 * The same shape as a reply check's result with `name` where that one carries
 * `kind`, so a reader who knows one knows the other. The difference is
 * deliberate: a reply check's kind comes from a closed enum the harness owns,
 * while a state result's name is an outcome the case declared, so the harness
 * pairs by name rather than by position and a scorer reporting a variable
 * number of results needs no change to how `checks` is read.
 */
export const stateResultSchema = z
	.object({
		name: z.string().min(1),
		status: z.enum(["PASS", "FAIL"]),
		detail: z.string().min(1),
	})
	.strict();

export type StateResult = z.infer<typeof stateResultSchema>;

const stateScorerOutputSchema = z
	.object({ results: z.array(stateResultSchema) })
	.strict();

export interface StateResults {
	readonly kind: "results";
	readonly results: readonly StateResult[];
}

export interface StateGradingError {
	readonly kind: "error";
	readonly detail: string;
}

export type StateScorerOutcome = StateResults | StateGradingError;

/**
 * A scorer that could not grade is a different fact from a grade that failed,
 * so every way the output can be unusable returns the error case rather than
 * a FAIL result: an operator comparing two arms must not read a broken scorer
 * as the corpus having got worse.
 *
 * A declared outcome the scorer did not report is one of those ways. The case
 * says which outcomes it expects, and a scorer that silently drops one leaves
 * a grade with nothing behind it.
 */
export function parseStateScorerOutput(
	stdout: string,
	declared: readonly string[],
): StateScorerOutcome {
	let document: unknown;
	try {
		document = JSON.parse(stdout);
	} catch (error) {
		return {
			kind: "error",
			detail: `scorer stdout is not JSON: ${error instanceof Error ? error.message : String(error)}`,
		};
	}

	const parsed = stateScorerOutputSchema.safeParse(document);
	if (!parsed.success) {
		const [issue] = parsed.error.issues;

		return {
			kind: "error",
			detail: `scorer stdout does not match the state result schema: ${issue?.path.join(".") ?? "results"}: ${issue?.message ?? "invalid"}`,
		};
	}

	const reported = new Map(
		parsed.data.results.map((result) => [result.name, result]),
	);
	const results = declared.flatMap((name) => {
		const result = reported.get(name);

		return result === undefined ? [] : [result];
	});
	if (results.length !== declared.length) {
		const missing = declared.filter((name) => !reported.has(name));

		return {
			kind: "error",
			detail: `scorer reported no result for ${missing.join(", ")}`,
		};
	}

	return { kind: "results", results };
}

export interface StateGradingRequest {
	readonly evidenceDirectory: string;
	readonly restoreDirectory: string;
	readonly command: readonly string[];
	readonly outcomes: readonly string[];
}

/**
 * The grade runs in a fresh restore rather than in the saved evidence, so a
 * scorer that writes, deletes, or commits changes only its own copy and the
 * next pass reads the same bytes this one did.
 *
 * A scorer that cannot run is a grading error, not a failed grade: a missing
 * executable, a non-zero exit, and a timeout each say nothing about the
 * session's work, and recording them as FAIL would let a broken scorer read as
 * a corpus that got worse.
 */
export async function gradeStateEvidence(
	request: Readonly<StateGradingRequest>,
): Promise<StateScorerOutcome> {
	const restored = await restoreStateEvidence(
		request.evidenceDirectory,
		request.restoreDirectory,
	);

	let stdout: string;
	try {
		stdout = await runAgainstStateEvidence(request.command, restored);
	} catch (error) {
		if (error instanceof CommandError) {
			return {
				kind: "error",
				detail: `scorer ${request.command.join(" ")} exited ${error.exitCode}: ${error.stderr.trim()}`,
			};
		}

		return {
			kind: "error",
			detail: `scorer ${request.command.join(" ")} could not run: ${error instanceof Error ? error.message : String(error)}`,
		};
	}

	return parseStateScorerOutput(stdout, request.outcomes);
}
