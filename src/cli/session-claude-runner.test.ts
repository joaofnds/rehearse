import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { tmpdir } from "node:os";

import runClaudeCommand from "./session-claude-runner";

const EFFORT_VARIABLE = "CLAUDE_CODE_EFFORT_LEVEL";

const inherited = Bun.env["CLAUDE_CODE_EFFORT_LEVEL"];

function setUp(): void {
	Bun.env["CLAUDE_CODE_EFFORT_LEVEL"] = "max";
}

function tearDown(): void {
	if (inherited === undefined) {
		delete Bun.env["CLAUDE_CODE_EFFORT_LEVEL"];
		return;
	}

	Bun.env["CLAUDE_CODE_EFFORT_LEVEL"] = inherited;
}

async function leavesTheEffortToTheCommandLine(): Promise<void> {
	const seen = await runClaudeCommand(
		["sh", "-c", `printf %s "\${${EFFORT_VARIABLE}-unset}"`],
		tmpdir(),
	);

	expect(seen).toBe("unset");
}

describe("the session runner", () => {
	beforeEach(setUp);
	afterEach(tearDown);

	it(
		"starts the session without the effort the harness environment sets",
		leavesTheEffortToTheCommandLine,
	);
});
