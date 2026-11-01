import { assertSessionConfinement } from "./claude-confinement";
import { runCommand } from "./command";
import type { CommandOptions } from "./command";

async function runClaudeCommand(
	command: readonly string[],
	cwd: string,
	options: CommandOptions = {},
): Promise<string> {
	await assertSessionConfinement(command, cwd);

	return await runCommand(command, cwd, options);
}

export { runClaudeCommand as default };
