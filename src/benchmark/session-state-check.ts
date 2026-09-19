import { cp } from "node:fs/promises";
import { join } from "node:path";
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

/**
 * The scorer is declared inline rather than as a file beside `case.json`
 * because `sessionUpstreamDigest` walks the fixture subdirectory and not the
 * case directory: a scorer file there would be covered by no digest, so a
 * session that edited it could be graded as the original definition. Declared
 * here, the command and its outcomes fold into the lineage digest with the
 * prompt and tools, and a confirmation run freezes `case.json` bodily.
 *
 * A scorer complex enough to need its own file is a command that invokes one
 * inside the fixture, which the fixture digest already covers.
 */
export const stateCheckSchema = z
	.object({
		command: z.array(z.string().min(1)).min(1),
		outcomes: z
			.array(z.string().min(1))
			.min(1)
			.refine(
				(names) => new Set(names).size === names.length,
				"declares the same outcome more than once",
			),
	})
	.strict();

export type StateCheck = z.infer<typeof stateCheckSchema>;

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
	readonly scorerSource: string | undefined;
	readonly command: readonly string[];
	readonly outcomes: readonly string[];
}

/**
 * Only the paths the command itself names are laid back, never the whole
 * fixture: restoring every file would overwrite the very work the grade is
 * meant to read. A word that resolves to a file under the case's fixture is
 * one of the scorer's own bytes; everything else in the command line is an
 * argument the session cannot reach.
 */
async function layBackScorerFiles(
	scorerSource: string,
	command: readonly string[],
	restored: string,
): Promise<void> {
	for (const word of command) {
		const source = join(scorerSource, word);
		if (!source.startsWith(`${scorerSource}/`)) {
			continue;
		}
		if (!(await Bun.file(source).exists())) {
			continue;
		}

		await cp(source, join(restored, word), { force: true });
	}
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
 *
 * The case's own files are laid back over the restore before the command runs.
 * A scorer declared as a path lives in the fixture, so seeding hands the
 * session a copy and the session may write to it; without this the grade would
 * execute whatever the session left at that path, and any session could report
 * itself successful. The grading definition is the case's bytes, which is what
 * the lineage digest covers.
 */
export async function gradeStateEvidence(
	request: Readonly<StateGradingRequest>,
): Promise<StateScorerOutcome> {
	const restored = await restoreStateEvidence(
		request.evidenceDirectory,
		request.restoreDirectory,
	);
	if (request.scorerSource !== undefined) {
		await layBackScorerFiles(request.scorerSource, request.command, restored);
	}

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
