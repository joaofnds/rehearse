import { afterEach, describe, expect, it } from "bun:test";

import { within } from "@testing-library/react";

import {
	RunRecordBuilder,
	RunRecordStageBuilder,
} from "#client/test-support/run-detail";

import {
	FINISHED_PLAN,
	RUN,
	openModal,
	originalFetch,
	renderMonitor,
} from "./step-modal-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("/monitor step modal", () => {
	describe("its header", () => {
		it(
			"shows the step's number, name, skill, wall time, cost, verdict and grade",
			showsTheStepSNumberNameSkillWallTimeCostVerdictAndGrade,
		);

		it(
			"reads each figure a running step has not produced as pending",
			readsEachFigureARunningStepHasNotProducedAsPending,
		);

		it(
			"reads each figure an ended step's record lacks as not recorded",
			readsEachFigureAnEndedStepSRecordLacksAsNotRecorded,
		);
	});
});

async function showsTheStepSNumberNameSkillWallTimeCostVerdictAndGrade(): Promise<void> {
	const stages = [
		new RunRecordStageBuilder({ stage: "plan", ...FINISHED_PLAN }).build(),
		new RunRecordStageBuilder().build(),
	];
	renderMonitor(
		stages,
		new Map([
			[
				`/api/runs/${RUN}`,
				{
					...new RunRecordBuilder({ run: RUN, stages }).build(),
					minimumGrade: { letter: "B-", state: "available" },
				},
			],
		]),
	);

	const dialog = await openModal("plan");

	expect(within(dialog).getByRole("banner")).toHaveTextContent(
		"Step 01plan.agents/skills/plan/SKILL.md · 4m02s · $1.34verdict Continued at minimum B- B+Esc",
	);
}

async function readsEachFigureARunningStepHasNotProducedAsPending(): Promise<void> {
	renderMonitor([
		new RunRecordStageBuilder({ stage: "plan", ...FINISHED_PLAN }).build(),
		new RunRecordStageBuilder().build(),
	]);

	const dialog = await openModal("build");

	expect(within(dialog).getByRole("banner")).toHaveTextContent(
		"Step 02buildskill pending · wall time pending · cost pendingverdict pending grade pendingEsc",
	);
}

async function readsEachFigureAnEndedStepSRecordLacksAsNotRecorded(): Promise<void> {
	renderMonitor([
		new RunRecordStageBuilder({
			stage: "plan",
			status: "stopped",
		}).build(),
		new RunRecordStageBuilder().build(),
	]);

	const dialog = await openModal("plan");

	expect(within(dialog).getByRole("banner")).toHaveTextContent(
		"skill not recorded: not read by this test · wall time not recorded: not read by this test · session cost not recorded: not read by this test · judge cost not recorded: not read by this test",
	);
	expect(within(dialog).getByRole("banner")).toHaveTextContent(
		"grade not recorded: not read by this test",
	);
}
