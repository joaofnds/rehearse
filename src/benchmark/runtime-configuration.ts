import { isAbsolute, relative, resolve } from "node:path";

import { benchmarkRunsDirectory } from "./run-layout";

const CONTROL_DIR = resolve(import.meta.dir, "../..");

const REQUIRED_BUN_VERSION = "1.4.0";

const COMMAND_TIMEOUT_MS = 300_000;

const CLAUDE_TIMEOUT_MS = 1_800_000;

const STAGE_SILENCE_LIMIT_MS = 1_800_000;

const MAX_STAGE_TURNS = 20;

const HARNESS_RUBRIC_IDS = ["check-integrity", "local-checks"] as const;

const MAX_CONTEXT_FILE_BYTES = 262_144;

const MAX_CONTEXT_TOTAL_BYTES = 1_048_576;

/**
 * How a path is named to a reader. Sessions paste this output onto cards that
 * other people read, and an absolute path under the control root discloses the
 * home directory for nothing: the control-relative path names the same file
 * and is the one a reader can act on. A path outside the control root is left
 * as it is, because relative to a root it is not under says less than the path
 * itself.
 */
function displayPath(path: string): string {
	const controlRelative = relative(CONTROL_DIR, path);

	return controlRelative.startsWith("..") || isAbsolute(controlRelative)
		? path
		: controlRelative;
}

/**
 * The resolver reads this variable, the test preload sets it, and the CLI
 * tests pass it to spawned children, so all three name it through this
 * constant. It must not start with BENCHMARK_, because the CLI tests strip
 * those variables from every child.
 */
const RECORDS_DIRECTORY_VARIABLE = "REHEARSE_RECORDS_DIR";

/**
 * Where every command reads and writes its records. The test preload points
 * the variable at a temporary directory, which is what keeps a test run out of
 * the operator's records.
 */
function recordsDirectory(
	env: Readonly<Record<string, string | undefined>> = Bun.env,
): string {
	const override = env[RECORDS_DIRECTORY_VARIABLE];

	if (override === "") {
		throw new Error(
			`${RECORDS_DIRECTORY_VARIABLE} is empty; unset it to keep records under .benchmark-runs`,
		);
	}

	return override === undefined
		? benchmarkRunsDirectory(CONTROL_DIR)
		: resolve(override);
}

const DEFAULT_CASE_ID = "audit-log";

/**
 * Every record written before cases were declared ran the case that now lives
 * at cases/audit-log, so a record on disk without a caseId means exactly that
 * case. Removing this default would make those records unreadable.
 */
const LEGACY_CASE_ID = DEFAULT_CASE_ID;

/**
 * A run artifact records the pipeline path so two runs can be compared, which
 * only works when the same pipeline yields the same string on every machine.
 * An absolute path and a path through ".." both name a file that a plain
 * relative path names too, so the path is reduced to that one form here, at the
 * boundary, rather than left for every later reader to normalise.
 */
function controlRelativePath(pipelinePath: string): string {
	return relative(CONTROL_DIR, resolve(CONTROL_DIR, pipelinePath));
}

export {
	CONTROL_DIR,
	REQUIRED_BUN_VERSION,
	COMMAND_TIMEOUT_MS,
	CLAUDE_TIMEOUT_MS,
	STAGE_SILENCE_LIMIT_MS,
	MAX_STAGE_TURNS,
	HARNESS_RUBRIC_IDS,
	MAX_CONTEXT_FILE_BYTES,
	MAX_CONTEXT_TOTAL_BYTES,
	displayPath,
	RECORDS_DIRECTORY_VARIABLE,
	recordsDirectory,
	DEFAULT_CASE_ID,
	LEGACY_CASE_ID,
	controlRelativePath,
};
