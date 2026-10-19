import { cp, rm } from "node:fs/promises";
import { join, relative } from "node:path";

import { CommandError } from "./command";
import {
	restoreStateEvidence,
	runAgainstStateEvidence,
} from "./session-state-evidence";
import { parseStateScorerOutput } from "./state-scorer-output";
import type { StateScorerOutcome } from "./state-scorer-output";

interface StateGradingRequest {
	readonly evidenceDirectory: string;
	readonly restoreDirectory: string;
	readonly scorerSource: string | undefined;
	readonly command: readonly string[];
	readonly outcomes: readonly string[];
	readonly timeoutMs?: number | undefined;
}

/**
 * A scorer is a command the case author wrote, and a grade that never returns
 * stalls the run it belongs to, so the deadline is explicit rather than left
 * to the shared command default.
 */
const STATE_SCORER_TIMEOUT_MS = 60_000;

/**
 * A word of the command that resolves to a file under the case's fixture is
 * one of the scorer's own bytes; everything else in the command line is an
 * argument the session cannot reach. Seeding leaves these paths out of the
 * session's tree and grading lays them back, so both read this one list.
 */
async function scorerFiles(
	fixturePath: string,
	command: readonly string[],
): Promise<readonly string[]> {
	const files = new Set<string>();
	await Array.fromAsync(command, async (word) => {
		const source = join(fixturePath, word);
		if (!source.startsWith(`${fixturePath}/`)) {
			return;
		}

		if (!(await Bun.file(source).exists())) {
			return;
		}

		files.add(relative(fixturePath, source));
	});

	return [...files];
}

/**
 * Only the paths the command itself names are laid back, never the whole
 * fixture: restoring every file would overwrite the very work the grade is
 * meant to read. Whatever the session left at such a path is removed first,
 * since a directory there would refuse the copy and leave the attempt
 * ungraded.
 */
async function layBackScorerFiles(
	scorerSource: string,
	command: readonly string[],
	restored: string,
): Promise<void> {
	await Array.fromAsync(
		await scorerFiles(scorerSource, command),
		async (file) => {
			await rm(join(restored, file), { force: true, recursive: true });
			await cp(join(scorerSource, file), join(restored, file));
		},
	);
}

/**
 * The grade runs in a fresh restore rather than in the saved evidence, so a
 * scorer that writes, deletes, or commits changes only its own copy and the
 * next pass reads the same bytes this one did.
 *
 * A scorer that cannot run is a grading error, not a failed grade: a missing
 * executable, a non-zero exit, and a deadline the scorer outlived each say
 * nothing about the session's work, and recording them as FAIL would let a
 * broken scorer read as a corpus that got worse. A timeout is named as one,
 * because the kill surfaces as an ordinary non-zero exit with empty stderr and
 * an operator reading "exited 137" learns nothing about why.
 *
 * The case's own files are laid back over the restore before the command runs.
 * Seeding leaves a scorer file out of the session's tree, but the session may
 * still write a file at that path; without this the grade would execute
 * whatever the session left there, and any session could report itself
 * successful. The grading definition is the case's bytes, which is what
 * the lineage digest covers.
 */
async function gradeStateEvidence(
	request: Readonly<StateGradingRequest>,
): Promise<StateScorerOutcome> {
	const restored = await restoreStateEvidence(
		request.evidenceDirectory,
		request.restoreDirectory,
	);
	if (request.scorerSource !== undefined) {
		await layBackScorerFiles(request.scorerSource, request.command, restored);
	}

	const timeoutMs = request.timeoutMs ?? STATE_SCORER_TIMEOUT_MS;
	const startedAt = Date.now();
	const executeStateScorer = async (): Promise<
		{ readonly kind: "stdout"; readonly stdout: string } | StateScorerOutcome
	> => {
		try {
			const stdout = await runAgainstStateEvidence(request.command, restored, {
				timeoutMs,
			});
			return { kind: "stdout", stdout };
		} catch (error) {
			if (error instanceof CommandError) {
				if (Date.now() - startedAt >= timeoutMs) {
					return {
						detail: `scorer ${request.command.join(" ")} timed out after ${timeoutMs}ms`,
						kind: "error",
					};
				}

				return {
					detail: `scorer ${request.command.join(" ")} exited ${error.exitCode}: ${error.stderr.trim()}`,
					kind: "error",
				};
			}

			return {
				detail: `scorer ${request.command.join(" ")} could not run: ${error instanceof Error ? error.message : String(error)}`,
				kind: "error",
			};
		}
	};

	const stdout = await executeStateScorer();
	if (stdout.kind !== "stdout") {
		return stdout;
	}

	return parseStateScorerOutput(stdout.stdout, request.outcomes);
}

export { STATE_SCORER_TIMEOUT_MS, scorerFiles, gradeStateEvidence };
export type { StateGradingRequest };
