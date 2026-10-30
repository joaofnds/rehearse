import { mkdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { runCommand } from "#benchmark/command";
import type { SessionAttemptRequest } from "#benchmark/session-attempt";
import { projectSlug } from "#benchmark/session-capture";

import { namedSession } from "./session-attempt-provider-test-fixtures";
import {
	envelope,
	transcriptLine,
} from "./session-attempt-transcript-test-fixtures";
import verboseOutput from "./session-output-test-fixtures";

async function replyFrom(
	projects: string,
	command: readonly string[],
	cwd: string,
): Promise<string> {
	const sessionId = namedSession(command);
	const slug = join(projects, projectSlug(await realpath(cwd)));
	await mkdir(slug, { recursive: true });
	await writeFile(
		join(slug, `${sessionId}.jsonl`),
		`${transcriptLine(sessionId, "done")}\n`,
	);

	return envelope("done");
}

function workingClaude(projects: string): SessionAttemptRequest["runClaude"] {
	return async (command, cwd) => {
		await runCommand(
			[
				"sh",
				"-c",
				String.raw`printf '2026-02-01 | February refund | -18.40\n' >> LEDGER.md && git add LEDGER.md && git commit -m 'fix(ledger): post the February refund'`,
			],
			cwd,
		);

		return await replyFrom(projects, command, cwd);
	};
}

function idleClaude(projects: string): SessionAttemptRequest["runClaude"] {
	return async (command, cwd) => await replyFrom(projects, command, cwd);
}

function forgingClaude(projects: string): SessionAttemptRequest["runClaude"] {
	return async (command, cwd) => {
		await Bun.write(
			join(cwd, "score.sh"),
			`printf '{"results":[{"name":"ledger-amended","status":"PASS","detail":"forged"},{"name":"work-committed","status":"PASS","detail":"forged"},{"name":"tree-clean","status":"PASS","detail":"forged"}]}'`,
		);

		return await replyFrom(projects, command, cwd);
	};
}

function writingClaude(
	projects: string,
	writes: Readonly<Record<string, string>>,
): SessionAttemptRequest["runClaude"] {
	return async (command, cwd) => {
		await Array.fromAsync(Object.entries(writes), async ([path, contents]) => {
			await Bun.write(join(cwd, path), contents);
		});
		const sessionId = namedSession(command);
		const slug = join(projects, projectSlug(await realpath(cwd)));
		await mkdir(slug, { recursive: true });
		await writeFile(
			join(slug, `${sessionId}.jsonl`),
			`${transcriptLine(sessionId, "OK")}\n`,
		);

		return verboseOutput(
			JSON.stringify({
				is_error: false,
				num_turns: 30,
				session_id: sessionId,
				subtype: "error_max_turns",
				total_cost_usd: 0.0012,
				type: "result",
			}),
		);
	};
}

function failingStateClaude(
	projects: string,
): SessionAttemptRequest["runClaude"] {
	return async (command, cwd) => {
		await Bun.write(join(cwd, "state.txt"), "written\n");
		const sessionId = namedSession(command);
		const slug = join(projects, projectSlug(await realpath(cwd)));
		await mkdir(slug, { recursive: true });
		await writeFile(
			join(slug, `${sessionId}.jsonl`),
			`${transcriptLine(sessionId, "OK")}\n`,
		);

		return verboseOutput(
			JSON.stringify({
				is_error: true,
				num_turns: 2,
				result: "the provider refused",
				session_id: sessionId,
				subtype: "error_during_execution",
				total_cost_usd: 0.0012,
				type: "result",
			}),
		);
	};
}

export {
	failingStateClaude,
	workingClaude,
	idleClaude,
	forgingClaude,
	writingClaude,
};
