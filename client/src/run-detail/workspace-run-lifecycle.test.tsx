import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import NamedHistoryBuilder from "#client/run-history/run-history-page-named-history-builder";
import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import FakeEventSource from "#client/test-support/event-source";
import type { Reply } from "#client/test-support/fetch-stub";
import { FakeServer } from "#client/test-support/fetch-stub";
import LiveReply from "#client/test-support/live-reply";
import {
	SHELL_BASELINE,
	renderAppAt,
	renderAppWithStub,
} from "#client/test-support/render-app";
import {
	RUN,
	RunRecordBuilder,
	RunRecordStageBuilder,
	renderRunDetail,
	stoppedAtBuild,
} from "#client/test-support/run-detail";

import { PAUSED_RUN_REPLIES, originalFetch } from "./workspace-test-fixtures";

let liveEnded = false;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("the run workspace", () => {
	it(
		"marks an unreached step as never run and links to the ended step",
		marksAnUnreachedStepAsNeverRunAndLinksToTheEndedStep,
	);

	it(
		"keeps an interrupted step's missing record and cost unknown",
		keepsAnInterruptedStepSMissingRecordAndCostUnknown,
	);

	it(
		"names a Judge left waiting by an ended run",
		namesAJudgeLeftWaitingByAnEndedRun,
	);

	it(
		"offers replay and instruction testing from a paused source",
		offersReplayAndInstructionTestingFromAPausedSource,
	);

	describe("after selecting a step in live Activity", () => {
		beforeEach(selectsActivityBeforeRunCompletion);
		it(
			"keeps Activity and the chosen step when a live run completes",
			keepsActivityAndTheChosenStepWhenALiveRunCompletes,
		);
	});

	it(
		"refuses replay in the inspector of an unfinished source",
		refusesReplayInTheInspectorOfAnUnfinishedSource,
	);
});

async function marksAnUnreachedStepAsNeverRunAndLinksToTheEndedStep(): Promise<void> {
	renderRunDetail(
		new Map<string, unknown>([
			[
				`/api/runs/${RUN}/stages/verify/output`,
				{
					reason: "This step has no saved output record.",
					state: "unavailable",
				},
			],
		]),
		[],
		`/runs/${RUN}?view=results&step=verify`,
	);

	const output = await screen.findByRole("region", { name: "Saved output" });
	expect(
		await within(output).findByText(/Not reached · this step never ran/u),
	).toBeInTheDocument();
	expect(
		screen.getByRole("region", { name: "Selected step assessment" }),
	).toHaveTextContent("never ran");
	expect(
		within(screen.getByRole("region", { name: "Next action" })).getByRole(
			"link",
			{ name: "Inspect ended step" },
		),
	).toHaveAttribute("href", `/runs/${RUN}?view=results&step=build`);
}

async function keepsAnInterruptedStepSMissingRecordAndCostUnknown(): Promise<void> {
	const base = stoppedAtBuild();
	const fetchReplies = new Map<string, unknown>([
		[
			"/api/runs",
			new NamedHistoryBuilder({
				rows: [
					new PipelineRunRowBuilder({ run: RUN, status: "INTERRUPTED" })
						.withExecutionProgress()
						.build(),
				],
			}).build(),
		],
		[
			`/api/runs/${RUN}`,
			{
				...base,
				stages: [new RunRecordStageBuilder().build()],
			},
		],
	]);
	renderRunDetail(fetchReplies);

	const graph = await screen.findByRole("region", { name: "Task graph" });
	const step = within(graph).getByRole("button", { name: /^build/u });

	expect(step).toHaveTextContent("step record missing");
	expect(step).not.toHaveTextContent("$0.00");
	expect(step).not.toHaveTextContent("never ran");
}

async function namesAJudgeLeftWaitingByAnEndedRun(): Promise<void> {
	const base = stoppedAtBuild();
	renderRunDetail(
		new Map([
			[
				`/api/runs/${RUN}`,
				{
					...base,
					stages: [
						new RunRecordStageBuilder({
							stage: "build",
							status: "awaiting-judgment",
						}).build(),
					],
				},
			],
		]),
	);

	const graph = await screen.findByRole("region", { name: "Task graph" });

	expect(
		within(graph).getByRole("button", { name: /^build/u }),
	).toHaveTextContent("judge never returned");
}

async function offersReplayAndInstructionTestingFromAPausedSource(): Promise<void> {
	renderRunDetail(PAUSED_RUN_REPLIES);
	expect(
		await screen.findByRole("button", { name: "Replay step 2" }),
	).toBeEnabled();
	expect(
		screen.getByRole("link", { name: "Edit instruction & replay" }),
	).toHaveAttribute("href", expect.stringContaining("sourceStep=build"));
	const graph = screen.getByRole("region", { name: "Task graph" });
	expect(
		within(graph).getByRole("button", { name: /^verify/u }),
	).toHaveTextContent("never ran");
}

async function selectsActivityBeforeRunCompletion(): Promise<void> {
	liveEnded = false;
	const record = stoppedAtBuild();
	const server = new FakeServer(
		new Map<string, Reply | LiveReply>([
			...[...SHELL_BASELINE].map(
				([path, body]) => [`GET ${path}`, { body, status: 200 }] as const,
			),
			[
				"GET /api/run-listing",
				new LiveReply(() => ({
					body: new NamedHistoryBuilder({
						rows: [
							new PipelineRunRowBuilder({
								run: RUN,
								status: liveEnded ? "COMPLETE" : "RUNNING",
							})
								.withExecutionProgress({ stage: "build" })
								.build(),
						],
					}).build(),
					status: 200,
				})),
			],
			[
				`GET /api/runs/${RUN}`,
				new LiveReply(() => ({
					body: {
						...record,
						finalOutcome: liveEnded
							? { status: "JUDGED", verdict: "PASS" }
							: { stage: "build", status: "PENDING" },
					},
					status: 200,
				})),
			],
		]),
	);
	server.install();
	renderAppAt(`/runs/${RUN}`);
	const graph = await screen.findByRole("region", { name: "Task graph" });
	fireEvent.click(within(graph).getByRole("button", { name: /^shape/u }));
	await waitFor(() => {
		expect(
			screen.getByRole("region", { name: "Live agent session" }),
		).toHaveTextContent("Step 1 · shape");
	});
}

async function keepsActivityAndTheChosenStepWhenALiveRunCompletes(): Promise<void> {
	const stream = FakeEventSource.openOn(`/api/runs/${RUN}/events`);
	liveEnded = true;
	stream.deliver();
	await waitFor(() => {
		expect(stream.closed).toBe(true);
	});
	expect(screen.getByRole("button", { name: "Activity" })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	expect(
		screen.getByRole("region", { name: "Live agent session" }),
	).toHaveTextContent("Step 1 · shape");
	expect(
		screen.queryByRole("button", { name: "Pause after this step" }),
	).not.toBeInTheDocument();
}

async function refusesReplayInTheInspectorOfAnUnfinishedSource(): Promise<void> {
	const record = new RunRecordBuilder({
		run: RUN,
		stages: [new RunRecordStageBuilder().build()],
	}).build();
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
		[`/api/runs/${RUN}`, record],
	]);
	renderAppWithStub(`/runs/${RUN}`, fetchReplies);
	fireEvent.click(
		await screen.findByRole("button", { name: "Inputs & output" }),
	);

	const dialog = await screen.findByRole("dialog");
	expect(
		within(dialog).getByRole("button", { name: "Replay from checkpoint" }),
	).toHaveAttribute("aria-disabled", "true");
	expect(dialog).toHaveTextContent(
		"build has no completed step record to replay",
	);
}
