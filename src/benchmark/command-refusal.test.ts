import { describe, expect, it } from "bun:test";

import { refuseCommands, runCommand } from "./command";
import { commandOutcome } from "./command-refusal-test-probe";

describe(refuseCommands.name, () => {
	it("refuses a command started while commands are refused", async () => {
		const release = refuseCommands();

		const outcome = await commandOutcome();
		release();

		expect(outcome).toBe("refused");
	});

	it("runs commands again once the refusal is released", async () => {
		refuseCommands()();

		const output = await runCommand(["echo", "ran"], process.cwd());

		expect(output).toBe("ran\n");
	});
});
