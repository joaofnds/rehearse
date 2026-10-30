import { runCommand } from "#benchmark/command";
import { CLAUDE_TIMEOUT_MS } from "#benchmark/config";
import type { ClaudeRunner } from "#benchmark/session-attempt";

/**
 * The run passes its own --model and --effort, and every command starts
 * without the model and effort a parent session exported, so none competes
 * with them.
 */
const runClaudeCommand: ClaudeRunner = async (command, cwd) =>
	await runCommand(command, cwd, { timeoutMs: CLAUDE_TIMEOUT_MS });

export { runClaudeCommand as default };
