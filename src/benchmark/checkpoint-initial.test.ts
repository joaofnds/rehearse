import { describe, expect, it } from "bun:test";

import { initialCheckpointInputs, rootLineage } from "./checkpoint";

const BASELINE_LINEAGE_COUNT = 1;

const initialState = {
	productBrief: "Brief text",
	task: "Task text",
	taskSha: "task-sha",
	workflowFiles: [{ path: "backlog/config.yml", sha256: "aa11" }],
} as const;

function testCheckpointsTheRunSInitialStateUnderTheReservedName(): void {
	const inputs = initialCheckpointInputs(initialState, {
		effort: "high",
		model: "sonnet",
	});

	expect(inputs.stage).toBe("initial");
	expect(inputs.targetSha).toBe("task-sha");

	expect(inputs.upstream).toBe(rootLineage(initialState));
	expect(inputs.corpusFiles).toEqual([]);
	expect(inputs.artifacts).toEqual([]);
	expect(inputs.effort).toBe("high");
}

function testCarriesTheSettingsFileTheRunDeclared(): void {
	const settingsFile = { path: "stage-settings.json", sha256: "ff66" };

	const inputs = initialCheckpointInputs(initialState, {
		effort: "high",
		model: "sonnet",
		settingsFile,
	});

	expect(inputs.settingsFile).toEqual(settingsFile);
}

function testSerializesWithoutAnEffortKeyWhenTheRunDeclaredNone(): void {
	const inputs = initialCheckpointInputs(initialState, { model: "sonnet" });

	expect(inputs.effort).toBeUndefined();
	expect(JSON.stringify(inputs)).not.toContain('"effort"');
}

function testReturnsTheSameKeyForTheSameInitialState(): void {
	expect(rootLineage({ ...initialState })).toBe(
		rootLineage({ ...initialState }),
	);
}

function testKeepsTheDigestRecordedForTheOrderedInitialState(): void {
	expect(rootLineage(initialState)).toBe(
		"e44eaf51a2741ca468bb3920a7d0f5e042f4e2ff8c3d5267d4d82d29fa464de1",
	);
}

function testChangesWhenAnyPartOfTheInitialStateChanges(): void {
	const variants = [
		rootLineage({ ...initialState, taskSha: "other-sha" }),
		rootLineage({ ...initialState, task: "Other task" }),
		rootLineage({ ...initialState, productBrief: "Other brief" }),
		rootLineage({ ...initialState, workflowFiles: [] }),
	];

	expect(new Set([rootLineage(initialState), ...variants]).size).toBe(
		variants.length + BASELINE_LINEAGE_COUNT,
	);
}

describe("initial checkpoint identities", () => {
	it(
		"checkpoints the run's initial state under the reserved name",
		testCheckpointsTheRunSInitialStateUnderTheReservedName,
	);
	it(
		"carries the settings file the run declared",
		testCarriesTheSettingsFileTheRunDeclared,
	);
	it(
		"serializes without an effort key when the run declared none",
		testSerializesWithoutAnEffortKeyWhenTheRunDeclaredNone,
	);
	it(
		"returns the same key for the same initial state",
		testReturnsTheSameKeyForTheSameInitialState,
	);
	it(
		"keeps the digest recorded for the ordered initial state",
		testKeepsTheDigestRecordedForTheOrderedInitialState,
	);
	it(
		"changes when any part of the initial state changes",
		testChangesWhenAnyPartOfTheInitialStateChanges,
	);
});
