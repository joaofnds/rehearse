import { lstat, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Immutable } from "./contracts";
import type { TranscriptLine } from "./transcript";

/** Where a record keeps its session's sub-agent files, beside its transcript. */
export const SUBAGENTS_DIRECTORY = "subagents";

const SUBAGENT_FILE = /^agent-[a-z0-9]+\.(?:jsonl|meta\.json)$/u;

/**
 * The provider writes each sub-agent's transcript and meta file under
 * `<sessionId>/subagents/` beside the session's own file, outside the directory
 * the session ran in, so they survive only if the record copies them.
 */
export function sessionSubagentsDirectory(sessionDirectory: string): string {
	return join(sessionDirectory, SUBAGENTS_DIRECTORY);
}

/**
 * The session under test can write into its own `subagents/` directory, so the
 * copy takes only regular files carrying the names the provider gives them. A
 * symlink there would copy whatever it points at into the record.
 */
export async function preserveSubagentFiles(
	sessionDirectory: string,
	recordDirectory: string,
): Promise<void> {
	const source = sessionSubagentsDirectory(sessionDirectory);
	const names = await readdir(source).catch(() => []);
	const destination = join(recordDirectory, SUBAGENTS_DIRECTORY);

	for (const name of names.filter((each) => SUBAGENT_FILE.test(each))) {
		const path = join(source, name);
		const entry = await lstat(path);
		if (entry.isFile()) {
			await mkdir(destination, { recursive: true });
			await Bun.write(join(destination, name), Bun.file(path));
		}
	}
}

/**
 * The agents the session's lines name that left no transcript in the record.
 * Saying so lets a reader mark the session's sub-agent coverage incomplete,
 * where silence would read as an agent that ran nothing and cost nothing.
 */
export async function unavailableSubagents(
	lines: Immutable<readonly TranscriptLine[]>,
	recordDirectory: string,
): Promise<readonly string[]> {
	const named = new Set(
		lines.map((line) => line.namedAgent).filter((id) => id !== undefined),
	);
	const unavailable: string[] = [];
	for (const agentId of named) {
		const transcript = join(
			recordDirectory,
			SUBAGENTS_DIRECTORY,
			`agent-${agentId}.jsonl`,
		);
		if (!(await Bun.file(transcript).exists())) {
			unavailable.push(agentId);
		}
	}

	return unavailable;
}
