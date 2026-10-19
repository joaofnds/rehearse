import { afterEach, describe, expect, it } from "bun:test";

import { within } from "@testing-library/react";

import { RunRecordStageBuilder } from "#client/test-support/run-detail";

import {
	FINISHED_PLAN,
	SKILL_PATH,
	TASK_CARD,
	openModal,
	originalFetch,
	renderMonitor,
} from "./step-modal-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("/monitor step modal", () => {
	describe("what went in", () => {
		it(
			"lists each instruction file the step loaded with its hash, role and changed state",
			listsEachInstructionFileTheStepLoadedWithItsHashRoleAndChangedState,
		);

		it(
			"names a finished first step's artifacts in by where each came from, its checkpoint within the case",
			namesAFinishedFirstStepSArtifactsInByWhereEachCameFromItsCheckpointWithinTheCase,
		);

		it(
			"names a stopped step's upstream as the step before it and each workflow-state file an earlier step changed",
			namesAStoppedStepSUpstreamAsTheStepBeforeItAndEachWorkflowStateFileAnEarlierStepChanged,
		);

		it(
			"reads a stopped step's instructions its record lacks as not recorded",
			readsAStoppedStepSInstructionsItsRecordLacksAsNotRecorded,
		);

		it(
			"says which earlier step's changes a running step's inputs cannot read, and that its instructions are pending",
			saysWhichEarlierStepSChangesARunningStepSInputsCannotReadAndThatItsInstructionsArePending,
		);
	});
});

async function listsEachInstructionFileTheStepLoadedWithItsHashRoleAndChangedState(): Promise<void> {
	renderMonitor([
		new RunRecordStageBuilder({ stage: "plan", ...FINISHED_PLAN }).build(),
		new RunRecordStageBuilder().build(),
	]);

	const dialog = await openModal("plan");

	expect(
		within(dialog).getByRole("list", {
			name: "Instructions this step loaded",
		}),
	).toHaveTextContent(`${SKILL_PATH}sha 88b0d2stage skill✓unchanged`);
}

async function namesAFinishedFirstStepSArtifactsInByWhereEachCameFromItsCheckpointWithinTheCase(): Promise<void> {
	renderMonitor([
		new RunRecordStageBuilder({
			stage: "plan",
			...FINISHED_PLAN,
			artifactsIn: {
				entries: [
					{
						from: "task declaration",
						taskId: "ACT-1",
					},
					{
						checkpointShortId: {
							shortId: "audit-log/r-0148/s0",
							state: "available",
						},
						from: "upstream checkpoint",
						target: "acme-api",
						upstream: "initial",
					},
				],
				missing: [],
			},
		}).build(),
		new RunRecordStageBuilder().build(),
	]);

	const dialog = await openModal("plan");

	expect(
		within(within(dialog).getByRole("list", { name: "Artifacts in" }))
			.getAllByRole("listitem")
			.map(({ textContent }) => textContent),
	).toEqual([
		"↓ACT-1task declaration",
		"↓acme-api at r-0148/s0initial checkpoint",
	]);
}

async function readsAStoppedStepSInstructionsItsRecordLacksAsNotRecorded(): Promise<void> {
	renderMonitor([
		new RunRecordStageBuilder({
			stage: "plan",
			status: "stopped",
		}).build(),
		new RunRecordStageBuilder().build(),
	]);

	const dialog = await openModal("plan");

	expect(dialog).toHaveTextContent(
		"Instructions not recorded: not read by this test",
	);
}

async function saysWhichEarlierStepSChangesARunningStepSInputsCannotReadAndThatItsInstructionsArePending(): Promise<void> {
	renderMonitor([
		new RunRecordStageBuilder({
			stage: "plan",
			status: "graded",
		}).build(),
		new RunRecordStageBuilder({
			artifactsIn: {
				entries: [
					{
						from: "task declaration",
						taskId: "ACT-1",
					},
					{
						checkpointShortId: {
							reasons: ["the stage saved no checkpoint"],
							state: "unavailable",
						},
						from: "upstream checkpoint",
						target: "acme-api",
						upstream: "plan",
					},
				],
				missing: [
					{
						part: "plan",
						reason: "the stage saved no checkpoint to compare",
					},
				],
			},
		}).build(),
	]);

	const dialog = await openModal("build");

	expect(dialog).toHaveTextContent(
		"Instructions pending: the step has not ended",
	);
	expect(
		within(within(dialog).getByRole("list", { name: "Artifacts in" }))
			.getAllByRole("listitem")
			.map(({ textContent }) => textContent),
	).toEqual([
		"↓ACT-1task declaration",
		"↓acme-api at plan's checkpointstep 01 checkpoint",
	]);
	expect(dialog).toHaveTextContent(
		"Not read: the workflow-state changes of step 01 · plan, as the stage saved no checkpoint to compare",
	);
}

async function namesAStoppedStepSUpstreamAsTheStepBeforeItAndEachWorkflowStateFileAnEarlierStepChanged(): Promise<void> {
	renderMonitor([
		new RunRecordStageBuilder({ stage: "plan", ...FINISHED_PLAN }).build(),
		new RunRecordStageBuilder({
			artifactsIn: {
				entries: [
					{
						from: "task declaration",
						taskId: "ACT-1",
					},
					{
						checkpointShortId: {
							shortId: "r-0148/s1",
							state: "available",
						},
						from: "upstream checkpoint",
						target: "acme-api",
						upstream: "plan",
					},
					{
						change: "modified",
						from: "earlier stage",
						path: TASK_CARD,
						stage: "plan",
					},
				],
				missing: [],
			},
			stage: "build",
			status: "stopped",
		}).build(),
	]);

	const dialog = await openModal("build");

	expect(
		within(within(dialog).getByRole("list", { name: "Artifacts in" }))
			.getAllByRole("listitem")
			.map(({ textContent }) => textContent),
	).toEqual([
		"↓ACT-1task declaration",
		"↓acme-api at r-0148/s1step 01 checkpoint",
		`↓${TASK_CARD}step 01 · plan · modified`,
	]);
}
