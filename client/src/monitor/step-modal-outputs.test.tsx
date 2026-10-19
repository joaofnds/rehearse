import { afterEach, describe, expect, it } from "bun:test";

import { within } from "@testing-library/react";

import { RunRecordStageBuilder } from "#client/test-support/run-detail";

import {
	FINISHED_PLAN,
	PLAN_JUDGE,
	TASK_CARD,
	openModal,
	originalFetch,
	renderMonitor,
} from "./step-modal-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("/monitor step modal", () => {
	describe("what came out", () => {
		it(
			"lists each artifact out with the detail its record holds",
			listsEachArtifactOutWithTheDetailItsRecordHolds,
		);

		it(
			"names each part of artifacts out an ended step's record cannot read",
			namesEachPartOfArtifactsOutAnEndedStepSRecordCannotRead,
		);

		it(
			"omits artifacts out for a step that has produced none",
			omitsArtifactsOutForAStepThatHasProducedNone,
		);

		it(
			"sums up the judge's fired blockers and returned dimensions",
			sumsUpTheJudgeSFiredBlockersAndReturnedDimensions,
		);

		it(
			"sums up what a returning judge has evaluated so far",
			sumsUpWhatAReturningJudgeHasEvaluatedSoFar,
		);
	});
});

async function namesEachPartOfArtifactsOutAnEndedStepSRecordCannotRead(): Promise<void> {
	renderMonitor([
		new RunRecordStageBuilder({
			artifactsOut: {
				changedPaths: {
					reasons: ["no paths kept"],
					state: "unavailable",
				},
				commitSubjects: {
					state: "available",
					subjects: ["wip"],
				},
				declared: {
					paths: [],
					state: "available",
				},
				workflowState: {
					reasons: ["no checkpoint"],
					state: "unavailable",
				},
			},
			stage: "plan",
			status: "stopped",
		}).build(),
		new RunRecordStageBuilder().build(),
	]);

	const dialog = await openModal("plan");

	expect(dialog).toHaveTextContent(
		"↑wipcommitNot read: the workflow-state changes, as no checkpointNot read: the changed paths, as no paths kept",
	);
}

async function omitsArtifactsOutForAStepThatHasProducedNone(): Promise<void> {
	renderMonitor([
		new RunRecordStageBuilder({ stage: "plan", ...FINISHED_PLAN }).build(),
		new RunRecordStageBuilder().build(),
	]);

	const dialog = await openModal("build");

	expect(
		within(dialog).queryByRole("heading", { name: "Artifacts out" }),
	).toBeNull();
}

async function listsEachArtifactOutWithTheDetailItsRecordHolds(): Promise<void> {
	renderMonitor([
		new RunRecordStageBuilder({
			stage: "plan",
			...FINISHED_PLAN,
			artifactsOut: {
				changedPaths: {
					paths: ["src/audit.ts"],
					state: "available",
				},
				commitSubjects: {
					state: "available",
					subjects: ["feat: add the audit log"],
				},
				declared: {
					paths: ["PLAN.md"],
					state: "available",
				},
				workflowState: {
					changes: [
						{
							change: "modified",
							path: TASK_CARD,
						},
					],
					state: "available",
				},
			},
		}).build(),
		new RunRecordStageBuilder().build(),
	]);

	const dialog = await openModal("plan");

	expect(
		within(within(dialog).getByRole("list", { name: "Artifacts out" }))
			.getAllByRole("listitem")
			.map(({ textContent }) => textContent),
	).toEqual([
		"↑PLAN.mddeclared artifact",
		`↑${TASK_CARD}workflow state · modified`,
		"↑feat: add the audit logcommit",
		"↑src/audit.tschanged path",
	]);
}

async function sumsUpTheJudgeSFiredBlockersAndReturnedDimensions(): Promise<void> {
	renderMonitor(
		[
			new RunRecordStageBuilder({ stage: "plan", ...FINISHED_PLAN }).build(),
			new RunRecordStageBuilder().build(),
		],
		new Map<string, unknown>([
			[
				PLAN_JUDGE,
				{
					dimensions: [{ evidence: [], grade: "C", id: "scope-discipline" }],
					hardBlockers: [
						{ evidence: [], id: "scope-declared", status: "FAIL" },
						{ evidence: [], id: "no-secrets", status: "PASS" },
						{ evidence: [], id: "tests-pass", status: "PASS" },
					],
					state: "judged",
				},
			],
		]),
	);

	const dialog = await openModal("plan");

	expect(
		await within(dialog).findByText(
			"1 of 3 blockers fired · 1 dimension returned",
		),
	).toBeInTheDocument();
}

async function sumsUpWhatAReturningJudgeHasEvaluatedSoFar(): Promise<void> {
	renderMonitor(
		[
			new RunRecordStageBuilder({ stage: "plan", ...FINISHED_PLAN }).build(),
			new RunRecordStageBuilder().build(),
		],
		new Map<string, unknown>([
			[
				PLAN_JUDGE,
				{
					progress: {
						attempt: 1,
						sections: {
							dimensions: { returned: 0, total: 2 },
							hardBlockers: { returned: 1, total: 3 },
							requirements: { returned: 0, total: 1 },
						},
						state: "returning",
					},
					state: "returning",
				},
			],
		]),
	);

	const dialog = await openModal("plan");

	expect(
		await within(dialog).findByText(
			"1 of 3 blockers evaluated · 0 of 2 dimensions returned",
		),
	).toBeInTheDocument();
}
