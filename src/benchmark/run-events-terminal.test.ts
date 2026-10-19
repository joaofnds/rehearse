import { describe, expect, it } from "bun:test";

import { isTerminalRunEventKind } from "./run-events";

describe(isTerminalRunEventKind.name, () => {
	it.each([
		["run-completed", true],
		["run-failed", true],
		["run-interrupted", true],
		["stage-started", false],
		["stage-judging", false],
		["stage-completed", false],
		["turn-completed", false],
	] as const)("reads %s as terminal: %s", (kind, expected) => {
		expect(isTerminalRunEventKind(kind)).toBe(expected);
	});
});
