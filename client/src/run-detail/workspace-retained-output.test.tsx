import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, within } from "@testing-library/react";

import NamedHistoryBuilder from "#client/run-history/run-history-page-named-history-builder";
import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import {
	RUN,
	RunRecordBuilder,
	RunRecordStageBuilder,
	renderRunDetail,
} from "#client/test-support/run-detail";

import { originalFetch } from "./workspace-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("the run workspace", () => {
	it(
		"describes running output as in progress and offers Activity",
		describesRunningOutputAsInProgressAndOffersActivity,
	);

	it.each([
		["results", "Saved output"],
		["activity", "Saved step output"],
	] as const)(
		"opens an asynchronously loaded saved diff as exact raw text in %s",
		readsAsynchronousSavedDiff,
	);

	it(
		"shows saved output beside the step assessment and opens its complete text",
		showsSavedOutputBesideTheStepAssessmentAndOpensItsCompleteText,
	);

	it(
		"keeps an unavailable saved output explicit",
		keepsAnUnavailableSavedOutputExplicit,
	);

	it(
		"shows retained output in ended Activity and links to the selected step transcript",
		showsRetainedOutputInEndedActivityAndLinksToTheSelectedStepTranscript,
	);
});

async function describesRunningOutputAsInProgressAndOffersActivity(): Promise<void> {
	const fetchReplies = new Map<string, unknown>([
		[
			"/api/runs",
			new NamedHistoryBuilder({
				rows: [
					new PipelineRunRowBuilder({ run: RUN })
						.withExecutionProgress({ stage: "build" })
						.build(),
				],
			}).build(),
		],
		[
			`/api/runs/${RUN}`,
			new RunRecordBuilder({
				run: RUN,
				stages: [new RunRecordStageBuilder().build()],
			}).build(),
		],
		[
			`/api/runs/${RUN}/stages/build/output`,
			{
				reason: "This step has no saved output record.",
				state: "unavailable",
			},
		],
	]);
	renderRunDetail(fetchReplies, [], `/runs/${RUN}?view=results&step=build`);

	const output = await screen.findByRole("region", { name: "Saved output" });
	expect(
		await within(output).findByText(/In progress · waiting/u),
	).toBeInTheDocument();
	expect(
		within(screen.getByRole("region", { name: "Next action" })).getByRole(
			"link",
			{ name: "Follow activity" },
		),
	).toHaveAttribute("href", `/runs/${RUN}?view=activity&step=build`);
}

async function showsSavedOutputBesideTheStepAssessmentAndOpensItsCompleteText(): Promise<void> {
	const expectedRegionCount = 1;

	renderRunDetail(
		new Map<string, unknown>([
			[
				`/api/runs/${RUN}/stages/build/output`,
				{
					kind: "artifact",
					path: "delivery.md",
					state: "available",
					text: "Saved delivery with items and nextCursor",
				},
			],
		]),
	);
	const output = await screen.findByRole("region", { name: "Saved output" });
	await within(output).findByText("Saved delivery with items and nextCursor");
	expect(
		screen.getAllByRole("region", { name: "Selected step assessment" }),
	).toHaveLength(expectedRegionCount);
	fireEvent.click(
		within(output).getByRole("button", { name: "Open complete output" }),
	);
	expect(await screen.findByRole("dialog")).toHaveTextContent(
		"Saved delivery with items and nextCursor",
	);
}

async function keepsAnUnavailableSavedOutputExplicit(): Promise<void> {
	renderRunDetail(
		new Map<string, unknown>([
			[
				`/api/runs/${RUN}/stages/build/output`,
				{
					reason: "The record predates saved Judge input",
					state: "unavailable",
				},
			],
		]),
	);
	expect(
		await screen.findByText("The record predates saved Judge input"),
	).toBeInTheDocument();
	expect(
		screen.queryByRole("button", { name: "Open complete output" }),
	).not.toBeInTheDocument();
}

async function showsRetainedOutputInEndedActivityAndLinksToTheSelectedStepTranscript(): Promise<void> {
	renderRunDetail(
		new Map<string, unknown>([
			[
				`/api/runs/${RUN}/stages/build/session`,
				{
					spans: [],
					state: "closed",
					transcriptPath: "saved/build/transcript.jsonl",
				},
			],
			[
				`/api/runs/${RUN}/stages/build/output`,
				{
					kind: "reply",
					state: "available",
					text: "# Retained completion\n\nThe saved completion is readable.",
				},
			],
		]),
		[],
		`/runs/${RUN}?view=activity&step=build`,
	);

	expect(
		await screen.findByRole("heading", { name: "Retained completion" }),
	).toBeInTheDocument();
	const session = screen.getByRole("region", { name: "Live agent session" });
	expect(
		within(session).getByRole("link", { name: "Open transcript" }),
	).toHaveAttribute(
		"href",
		`/runs/${RUN}?view=context&step=build&focus=events`,
	);
}

async function readsAsynchronousSavedDiff(
	view: string,
	label: string,
): Promise<void> {
	const diff = "-  a\n+  b\n";
	renderRunDetail(
		new Map<string, unknown>([
			[`/api/runs/${RUN}/stages/build/session`, { spans: [], state: "closed" }],
			[
				`/api/runs/${RUN}/stages/build/output`,
				{ kind: "diff", state: "available", text: diff },
			],
		]),
		[],
		`/runs/${RUN}?view=${view}&step=build`,
	);

	const output = await screen.findByRole("region", { name: label });
	const raw = await within(output).findByRole("button", { name: "Raw" });
	expect(raw).toHaveAttribute("aria-pressed", "true");
	expect(output.querySelector("pre")?.textContent).toBe(diff);
	fireEvent.click(within(output).getByRole("button", { name: "Formatted" }));
	expect(
		within(output).getByRole("button", { name: "Formatted" }),
	).toHaveAttribute("aria-pressed", "true");
	fireEvent.click(raw);
	expect(output.querySelector("pre")?.textContent).toBe(diff);
}
