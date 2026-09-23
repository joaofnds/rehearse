import { describe, expect, it } from "bun:test";
import { isStopped, runStatusState, stoppedStage } from "./run-status";

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

describe(isStopped.name, () => {
	it.each(["STOPPED:build", "STOPPED:a:b"])("reads %s as stopped", (status) => {
		expect(isStopped(status)).toBe(true);
	});

	it.each([
		"COMPLETE",
		"RUNNING",
		"INTERRUPTED",
		"FAILED",
		"AWAITING_HUMAN_REVIEW",
	])("reads %s as not stopped", (status) => {
		expect(isStopped(status)).toBe(false);
	});
});

describe(stoppedStage.name, () => {
	it.each([
		["STOPPED:build", "build"],
		["STOPPED:a:b", "a:b"],
	] as const)("reads %s as stopped on %s", (status, expected) => {
		expect(stoppedStage(status)).toBe(expected);
	});
});
