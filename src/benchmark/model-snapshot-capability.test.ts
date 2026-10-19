import { expect, it } from "bun:test";

import { CONTROL_DIR } from "./config";
import { RefusedPreconditionError } from "./exit-codes";
import { assertSystemPromptSnapshotSupported } from "./model-preflight";

it("accepts a Claude CLI that advertises prompt snapshot control", async () => {
	const calls: { command: readonly string[]; cwd: string }[] = [];

	await assertSystemPromptSnapshotSupported(async (command, cwd) => {
		calls.push({ command, cwd });

		return await Promise.resolve(
			"--system-prompt-snapshot <on|off>  Control prompt snapshots",
		);
	});

	expect(calls).toEqual([{ command: ["claude", "--help"], cwd: CONTROL_DIR }]);
});

it("refuses a Claude CLI without prompt snapshot control", () => {
	const failure = assertSystemPromptSnapshotSupported(
		async () => await Promise.resolve("Usage: claude [options]"),
	);

	expect(failure).rejects.toBeInstanceOf(RefusedPreconditionError);
	expect(failure).rejects.toThrow("did not advertise");
});

it("refuses when Claude help cannot run", () => {
	const failure = assertSystemPromptSnapshotSupported(
		async () => await Promise.reject(new Error("spawn ENOENT")),
	);

	expect(failure).rejects.toBeInstanceOf(RefusedPreconditionError);
	expect(failure).rejects.toThrow("claude --help` failed");
});
