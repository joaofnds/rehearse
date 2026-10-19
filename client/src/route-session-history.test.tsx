import { afterEach, describe, expect, it } from "bun:test";

import { screen, waitFor, within } from "@testing-library/react";

import { renderAppWithStub } from "#client/test-support/render-app";
import { RUN, renderRunDetail } from "#client/test-support/run-detail";

import {
	emptyHistory,
	emptyRequestSeries,
	originalFetch,
} from "./route-test-fixtures";
import createAppRouter from "./router";

afterEach(() => {
	globalThis.fetch = originalFetch;
});
describe(createAppRouter.name, () => {
	it(
		"renders standalone saved session history",
		rendersStandaloneSavedSessionHistory,
	);

	it(
		"opens a saved session attempt on Results with its Context available",
		opensASavedSessionAttemptOnResultsWithItsContextAvailable,
	);

	it(
		"renders a saved pipeline stage's context history",
		rendersASavedPipelineStageSContextHistory,
	);

	it(
		"renders a stage replay's saved history from the replay it names, asking for nothing it does not serve",
		rendersAStageReplaySSavedHistoryFromTheReplayItNamesAskingForNothingItDoesNotServe,
	);

	it(
		"renders confirmation rep saved session history",
		rendersConfirmationRepSavedSessionHistory,
	);
});

async function rendersStandaloneSavedSessionHistory(): Promise<void> {
	renderAppWithStub(
		"/attempts/session/case-a/attempt-a?view=context",
		new Map<string, unknown>([
			[
				"/api/attempts/session/case-a/attempt-a/history",
				emptyHistory("case-a", "attempt-a"),
			],
			[
				"/api/attempts/session/case-a/attempt-a/history/requests",
				emptyRequestSeries(),
			],
			[
				"/api/attempts/session/case-a/attempt-a/history/agents",
				{
					reason: "the attempt has no saved transcript",
					state: "unavailable",
				},
			],
		]),
	);

	await waitFor(() => {
		const lowerBoundForMatchingElementsCount = 0;

		expect(screen.getAllByText("case-a").length).toBeGreaterThan(
			lowerBoundForMatchingElementsCount,
		);
		expect(screen.getAllByText("attempt-a").length).toBeGreaterThan(
			lowerBoundForMatchingElementsCount,
		);
	});
	expect(screen.queryByRole("alert")).not.toBeInTheDocument();
}

async function opensASavedSessionAttemptOnResultsWithItsContextAvailable(): Promise<void> {
	renderAppWithStub(
		"/attempts/session/case-a/attempt-a",
		new Map([["/api/runs", { launches: [], rows: [], unreadable: [] }]]),
	);

	const views = await screen.findByRole("navigation", {
		name: "Attempt views",
	});
	expect(within(views).getByRole("link", { name: "Results" })).toHaveAttribute(
		"aria-current",
		"page",
	);
	expect(
		within(views).getByRole("link", { name: "Context & cost" }),
	).toHaveAttribute("href", "/attempts/session/case-a/attempt-a?view=context");
	expect(
		await screen.findByText(
			"This saved attempt has no readable result in Runs.",
		),
	).toBeInTheDocument();
}

async function rendersASavedPipelineStageSContextHistory(): Promise<void> {
	renderRunDetail(
		new Map<string, unknown>([
			[
				`/api/runs/${RUN}/stages/shape/history`,
				{
					...emptyHistory("case-a", "unused"),
					attempt: {
						caseId: "case-a",
						corpusFiles: [],
						kind: "stage",
						lineage: "lineage-1",
						model: "sonnet",
						run: RUN,
						stage: "shape",
						upstream: "upstream-1",
					},
				},
			],
		]),
		[],
		`/runs/${RUN}/stages/shape`,
	);

	await waitFor(() => {
		expect(
			screen.getByRole("button", { name: "Context & cost" }),
		).toHaveAttribute("aria-pressed", "true");
		const graph = screen.getByRole("region", { name: "Task graph" });
		const selected = within(graph).getByRole("button", { name: /^shape/u });
		expect(selected).toHaveTextContent("shape");
		expect(selected).toHaveAttribute("aria-current", "step");
		expect(screen.getByText("lineage-1")).toBeInTheDocument();
	});
}

async function rendersAStageReplaySSavedHistoryFromTheReplayItNamesAskingForNothingItDoesNotServe(): Promise<void> {
	renderAppWithStub(
		"/replays/60758c/2026-09-06T22-33-15.057Z?view=context",
		new Map<string, unknown>([
			[
				"/api/replays/60758c/2026-09-06T22-33-15.057Z/history",
				{
					...emptyHistory("case-a", "unused"),
					attempt: {
						caseId: "case-a",
						corpusFiles: [],
						kind: "stage",
						lineage: "60758c",
						model: "sonnet",
						run: "2026-09-06T22-33-15.057Z",
						stage: "shape",
						upstream: "upstream-1",
					},
					attemptEvents: [
						{
							id: "1:1",
							kind: "call",
							label: "Read CLAUDE.md",
							locator: { block: 1, line: 1 },
							measurement: {
								reasons: ["not delivered"],
								state: "unavailable",
							},
							region: "attempt",
							relatedEventIds: [],
							sourceId: "project:/work/CLAUDE.md",
							state: "invoked",
							timestamp: "2026-09-06T22:33:16.000Z",
							toolName: "Read",
							toolUseId: "read-1",
						},
					],
				},
			],
		]),
	);

	await waitFor(() => {
		expect(screen.getByText("60758c")).toBeInTheDocument();
		expect(
			screen.getByText("A replay serves no per-event evidence detail."),
		).toBeInTheDocument();
	});
	expect(screen.queryByRole("alert")).not.toBeInTheDocument();
}

async function rendersConfirmationRepSavedSessionHistory(): Promise<void> {
	renderAppWithStub(
		"/groups/group-a/reps/group-a-rep-1/attempt?view=context",
		new Map<string, unknown>([
			[
				"/api/groups/group-a/reps/group-a-rep-1/attempt/result",
				{
					caseId: "case-a",
					elapsedMs: 0,
					finalOutcome: { status: "NOT_APPLICABLE" },
					groupId: "group-a",
					lineage: { kind: "SESSION", lineage: "session-lineage" },
					metrics: { calls: [], status: "COMPLETE" },
					mode: "session",
					ordinal: 1,
					outcome: "SUCCESSFUL",
					repId: "group-a-rep-1",
					schemaVersion: 2,
					stages: [],
					workerTrajectorySteps: 0,
				},
			],
			[
				"/api/groups/group-a/reps/group-a-rep-1/attempt/history",
				emptyHistory("case-a", "group-a-rep-1"),
			],
			[
				"/api/groups/group-a/reps/group-a-rep-1/attempt/history/requests",
				emptyRequestSeries(),
			],
			[
				"/api/groups/group-a/reps/group-a-rep-1/attempt/history/agents",
				{
					reason: "the attempt has no saved transcript",
					state: "unavailable",
				},
			],
		]),
	);

	await waitFor(() => {
		expect(screen.getByText("case-a")).toBeInTheDocument();
		expect(screen.getByText("group-a-rep-1")).toBeInTheDocument();
	});
	expect(screen.queryByRole("alert")).not.toBeInTheDocument();
}
