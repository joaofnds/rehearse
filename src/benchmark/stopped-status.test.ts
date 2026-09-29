import { describe, expect, it } from "bun:test";
import {
	isPaused,
	isStopped,
	pausedStatus,
	stoppedStageOf,
	stoppedStatus,
} from "./stopped-status";

describe(stoppedStatus.name, () => {
	it("names the stage a run stopped on after the stopped prefix", () => {
		expect(stoppedStatus("build")).toBe("STOPPED:build");
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

describe(stoppedStageOf.name, () => {
	it.each(["build", "a:b"])(
		"reads back %s from the status it wrote",
		(stage) => {
			expect(stoppedStageOf(stoppedStatus(stage))).toBe(stage);
		},
	);
});

describe(isPaused.name, () => {
	it("reads the status pausedStatus writes as paused and a stopped one as not", () => {
		expect(isPaused(pausedStatus("discuss"))).toBe(true);
		expect(isPaused(stoppedStatus("discuss"))).toBe(false);
	});
});
