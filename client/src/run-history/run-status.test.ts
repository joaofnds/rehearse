import { describe, expect, it } from "bun:test";
import { runStatusState } from "./run-status";

describe(runStatusState.name, () => {
	it.each([
		["COMPLETE", "accepted"],
		["RUNNING", "running"],
		["FAILED", "interrupted"],
		["INTERRUPTED", "interrupted"],
		["AWAITING_HUMAN_REVIEW", "pending"],
		["STOPPED:build", "stopped"],
		["STOPPED:shape", "stopped"],
	] as const)("reads %s as %s", (status, expected) => {
		expect(runStatusState(status)).toBe(expected);
	});

	it("reads an unrecognized status as pending rather than guessing a glyph", () => {
		expect(runStatusState("SOMETHING_NEW")).toBe("pending");
	});
});
