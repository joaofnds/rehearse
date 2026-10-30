import { runCommand } from "#benchmark/command";
import { CLAUDE_TIMEOUT_MS } from "#benchmark/config";
import type { ClaudeRunner } from "#benchmark/session-attempt";
import { RUN_DECIDED_VARIABLES } from "#benchmark/session-setup";

/**
 * The run passes its own --model and --effort, so a model or effort the
 * harness's environment carries is unset rather than left to compete with them.
 */
const runClaudeCommand: ClaudeRunner = async (command, cwd) =>
	await runCommand(command, cwd, {
		env: Object.fromEntries(
			[...RUN_DECIDED_VARIABLES].map((name) => [name, undefined]),
		),
		timeoutMs: CLAUDE_TIMEOUT_MS,
	});

export { runClaudeCommand as default };
