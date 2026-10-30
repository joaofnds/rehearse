import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { chmod, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { EXECUTABLE_PERMISSIONS } from "#server/file-permissions-test-support";

import { runCommand } from "./command";
import { TestResources } from "./test-support";

const PARENT_SESSION_VARIABLES = {
	ANTHROPIC_BASE_URL: "https://gateway.example",
	CLAUDE_CODE_ENTRYPOINT: "claude-desktop",
};

const testResources = TestResources.forEachTest();

const savedParentSession = new Map<string, string | undefined>();

function exportParentSession(): void {
	for (const [name, value] of Object.entries(PARENT_SESSION_VARIABLES)) {
		savedParentSession.set(name, Bun.env[name]);
		Bun.env[name] = value;
	}
}

function restoreParentSession(): void {
	for (const [name, value] of savedParentSession) {
		if (value === undefined) {
			Reflect.deleteProperty(Bun.env, name);
		} else {
			Bun.env[name] = value;
		}
	}
	savedParentSession.clear();
}

/** A `claude` that prints the environment it was started with. */
async function environmentPrintingClaude(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "rehearse-claude-env-"));
	testResources.track(directory);
	const claude = join(directory, "claude");
	await Bun.write(claude, "#!/bin/sh\nenv\n");
	await chmod(claude, EXECUTABLE_PERMISSIONS);

	return claude;
}

const startsClaudeCodeWithoutTheParentSessionsVariables =
	async (): Promise<void> => {
		const claude = await environmentPrintingClaude();

		const printed = await runCommand([claude], process.cwd());

		expect(printed).not.toContain("CLAUDE_CODE_ENTRYPOINT=");
		expect(printed).toContain("ANTHROPIC_BASE_URL=https://gateway.example");
	};

const leavesTheParentSessionsVariablesToOtherCommands =
	async (): Promise<void> => {
		const printed = await runCommand(["env"], process.cwd());

		expect(printed).toContain("CLAUDE_CODE_ENTRYPOINT=claude-desktop");
	};

describe(runCommand.name, () => {
	describe("when started from inside a Claude Code session", () => {
		beforeEach(exportParentSession);
		afterEach(restoreParentSession);

		it(
			"starts Claude Code without the parent session's variables",
			startsClaudeCodeWithoutTheParentSessionsVariables,
		);

		it(
			"leaves the parent session's variables to other commands",
			leavesTheParentSessionsVariablesToOtherCommands,
		);
	});
});
