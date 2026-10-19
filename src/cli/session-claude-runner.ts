import { runCommand } from "#benchmark/command";
import { CLAUDE_TIMEOUT_MS } from "#benchmark/config";
import type { ClaudeRunner } from "#benchmark/session-attempt";

const runClaudeCommand: ClaudeRunner = async (command, cwd) =>
	await runCommand(command, cwd, {
		timeoutMs: CLAUDE_TIMEOUT_MS,
	});

export { runClaudeCommand as default };
