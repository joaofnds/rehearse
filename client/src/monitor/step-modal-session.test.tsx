import { afterEach, describe, expect, it } from "bun:test";

import { within } from "@testing-library/react";

import { RunRecordStageBuilder } from "#client/test-support/run-detail";

import {
	FINISHED_PLAN,
	PLAN_SESSION,
	RUN,
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
			"opens the selected step's full report in Results",
			opensTheSelectedStepSFullReportInResults,
		);

		it(
			"links the session on disk where its transcript is recorded",
			linksTheSessionOnDiskWhereItsTranscriptIsRecorded,
		);

		it(
			"says when no transcript of the step's session is recorded",
			saysWhenNoTranscriptOfTheStepSSessionIsRecorded,
		);

		it(
			"says when the step's session cannot be read",
			saysWhenTheStepSSessionCannotBeRead,
		);
	});
});

async function opensTheSelectedStepSFullReportInResults(): Promise<void> {
	renderMonitor([
		new RunRecordStageBuilder({ stage: "plan", ...FINISHED_PLAN }).build(),
		new RunRecordStageBuilder().build(),
	]);

	const dialog = await openModal("plan");

	expect(
		within(dialog).getByRole("link", { name: "Full step report" }),
	).toHaveAttribute("href", `/runs/${RUN}?view=results&step=plan`);
}

async function saysWhenTheStepSSessionCannotBeRead(): Promise<void> {
	renderMonitor([
		new RunRecordStageBuilder({ stage: "plan", ...FINISHED_PLAN }).build(),
		new RunRecordStageBuilder().build(),
	]);

	const dialog = await openModal("plan");

	expect(
		await within(dialog).findByText("Could not read this step's session."),
	).toBeInTheDocument();
}

async function linksTheSessionOnDiskWhereItsTranscriptIsRecorded(): Promise<void> {
	renderMonitor(
		[
			new RunRecordStageBuilder({ stage: "plan", ...FINISHED_PLAN }).build(),
			new RunRecordStageBuilder().build(),
		],
		new Map<string, unknown>([
			[
				PLAN_SESSION,
				{
					lineCount: 12,
					spans: [],
					state: "closed",
					transcriptPath: `.benchmark-runs/${RUN}.checkpoints/plan/transcript.jsonl`,
				},
			],
		]),
	);

	const dialog = await openModal("plan");

	expect(
		await within(dialog).findByRole("link", {
			name: "Open its transcript",
		}),
	).toHaveAttribute("href", `/runs/${RUN}/stages/plan`);
}

async function saysWhenNoTranscriptOfTheStepSSessionIsRecorded(): Promise<void> {
	renderMonitor(
		[
			new RunRecordStageBuilder({ stage: "plan", ...FINISHED_PLAN }).build(),
			new RunRecordStageBuilder().build(),
		],
		new Map<string, unknown>([[PLAN_SESSION, { spans: [], state: "closed" }]]),
	);

	const dialog = await openModal("plan");

	expect(
		await within(dialog).findByText(
			"Transcript not recorded: Rehearse kept no copy of this step's session",
		),
	).toBeInTheDocument();
}
