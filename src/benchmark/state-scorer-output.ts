import { z } from "zod";

import parseJsonDocument from "./json-document";
import orderedValidationIssues from "./validation-issue-order";

/**
 * The same shape as a reply check's result with `name` where that one carries
 * `kind`, so a reader who knows one knows the other. The difference is
 * deliberate: a reply check's kind comes from a closed enum the harness owns,
 * while a state result's name is an outcome the case declared, so the harness
 * pairs by name rather than by position and a scorer reporting a variable
 * number of results needs no change to how `checks` is read.
 */
const stateResultSchema = z
	.object({
		detail: z.string().nonempty(),
		name: z.string().nonempty(),
		status: z.enum(["PASS", "FAIL"]),
	})
	.strict();

type StateResult = z.infer<typeof stateResultSchema>;

const stateScorerOutputSchema = z
	.object({ results: z.array(stateResultSchema) })
	.strict();

interface StateResults {
	readonly kind: "results";
	readonly results: readonly StateResult[];
}

interface StateGradingError {
	readonly kind: "error";
	readonly detail: string;
}

type StateScorerOutcome = StateResults | StateGradingError;

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
function parseStateScorerOutput(
	stdout: string,
	declared: readonly string[],
): StateScorerOutcome {
	const documentReading = parseJsonDocument(stdout, stateScorerOutputSchema);
	if (documentReading.kind === "invalid-json") {
		const { error } = documentReading;
		return {
			detail: `scorer stdout is not JSON: ${error instanceof Error ? error.message : String(error)}`,
			kind: "error",
		};
	}

	const { parsed } = documentReading;
	if (!parsed.success) {
		const [issue] = orderedValidationIssues({
			error: parsed.error,
			order: {
				children: { results: { fields: ["name", "status", "detail"] } },
				fields: ["results"],
			},
		});

		return {
			detail: `scorer stdout does not match the state result schema: ${issue?.path.join(".") ?? "results"}: ${issue?.message ?? "invalid"}`,
			kind: "error",
		};
	}

	return declaredResults(parsed.data.results, declared);
}

function declaredResults(
	reportedResults: readonly StateResult[],
	declared: readonly string[],
): StateScorerOutcome {
	const reported = new Map(
		reportedResults.map((result) => [result.name, result]),
	);
	const results = declared.flatMap((name) => {
		const result = reported.get(name);

		return result === undefined ? [] : [result];
	});
	if (results.length !== declared.length) {
		const missing = declared.filter((name) => !reported.has(name));

		return {
			detail: `scorer reported no result for ${missing.join(", ")}`,
			kind: "error",
		};
	}

	return { kind: "results", results };
}

export { stateResultSchema, parseStateScorerOutput };
export type {
	StateResult,
	StateResults,
	StateGradingError,
	StateScorerOutcome,
};
