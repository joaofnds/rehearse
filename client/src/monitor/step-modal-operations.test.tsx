import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import { RunRecordStageBuilder } from "#client/test-support/run-detail";

import {
	FINISHED_PLAN,
	RUN,
	SKILL_PATH,
	openModal,
	originalFetch,
	renderEndedMonitor,
	renderMonitor,
} from "./step-modal-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("/monitor step modal", () => {
	describe("operating on the step", () => {
		it(
			"offers replay from the checkpoint the step started from",
			offersReplayFromTheCheckpointTheStepStartedFrom,
		);

		it(
			"disables replay with its reason when the checkpoint the step started from is missing",
			disablesReplayWithItsReasonWhenTheCheckpointTheStepStartedFromIsMissing,
		);

		it(
			"withholds replay while the source run is still active",
			withholdsReplayWhileTheSourceRunIsStillActive,
		);

		it(
			"withholds replay when the selected step has no ended record",
			withholdsReplayWhenTheSelectedStepHasNoEndedRecord,
		);

		it(
			"opens the step's case's step editor on this step, and skill editing on the Corpus screen",
			opensTheStepSCaseSStepEditorOnThisStepAndSkillEditingOnTheCorpusScreen,
		);
	});
});

async function offersReplayFromTheCheckpointTheStepStartedFrom(): Promise<void> {
	renderEndedMonitor([
		new RunRecordStageBuilder({
			stage: "plan",
			...FINISHED_PLAN,
			artifactsIn: {
				entries: [
					{
						checkpointShortId: {
							reasons: ["predates short ids"],
							state: "unavailable",
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
		within(dialog).getByRole("button", { name: "Replay from checkpoint" }),
	).not.toHaveAttribute("aria-disabled");
}

async function disablesReplayWithItsReasonWhenTheCheckpointTheStepStartedFromIsMissing(): Promise<void> {
	renderEndedMonitor([
		new RunRecordStageBuilder({
			stage: "plan",
			status: "graded",
		}).build(),
		new RunRecordStageBuilder({
			stage: "build",
			status: "graded",
		}).build(),
	]);

	const dialog = await openModal("build");

	expect(
		within(dialog).getByRole("button", { name: "Replay from checkpoint" }),
	).toHaveAttribute("aria-disabled", "true");
	expect(dialog).toHaveTextContent(
		"Replay from checkpointbuild has no checkpoint to replay from",
	);
}

async function withholdsReplayWhileTheSourceRunIsStillActive(): Promise<void> {
	renderMonitor([
		new RunRecordStageBuilder({ stage: "plan", ...FINISHED_PLAN }).build(),
		new RunRecordStageBuilder().build(),
	]);

	const dialog = await openModal("plan");

	expect(dialog).toHaveTextContent(
		"Wait for the source run to end before replaying a step",
	);
	expect(
		within(dialog).getByRole("button", { name: "Replay from checkpoint" }),
	).toHaveAttribute("aria-disabled", "true");
}

async function withholdsReplayWhenTheSelectedStepHasNoEndedRecord(): Promise<void> {
	renderMonitor([
		new RunRecordStageBuilder({ stage: "plan", ...FINISHED_PLAN }).build(),
		new RunRecordStageBuilder().build(),
	]);

	const dialog = await openModal("build");

	expect(dialog).toHaveTextContent(
		"build has no completed step record to replay",
	);
	expect(
		within(dialog).getByRole("button", { name: "Replay from checkpoint" }),
	).toHaveAttribute("aria-disabled", "true");
}

async function opensTheStepSCaseSStepEditorOnThisStepAndSkillEditingOnTheCorpusScreen(): Promise<void> {
	const rubric = "cases/audit-log/rubrics/plan.json";
	renderMonitor(
		[
			new RunRecordStageBuilder({ stage: "plan", ...FINISHED_PLAN }).build(),
			new RunRecordStageBuilder().build(),
		],
		new Map([
			[
				"/api/cases/audit-log/steps",
				{
					caseId: "audit-log",
					pipeline: "cases/audit-log/pipelines/default.json",
					rubrics: [rubric],
					stages: [
						{
							kind: "planning",
							name: "plan",
							requiresAcceptanceCriteria: false,
							rubric,
							skill: "plan",
						},
						{ kind: "delivery", name: "build", rubric, skill: "build" },
					],
				},
			],
		]),
	);

	const dialog = await openModal("plan");
	expect(
		within(dialog).getByRole("link", { name: "Edit its skill" }),
	).toHaveAttribute(
		"href",
		`/corpus?file=${encodeURIComponent(SKILL_PATH)}&sourceRun=${RUN}&sourceStep=plan`,
	);
	fireEvent.click(
		within(dialog).getByRole("button", { name: "Edit this step" }),
	);

	const editor = await screen.findByRole("dialog", {
		name: "Edit steps · audit-log",
	});
	const plan = await within(editor).findByRole("group", { name: "Step 1" });
	await waitFor(() => {
		expect(within(plan).getByLabelText("Name")).toHaveFocus();
	});
}
