import { afterEach, describe, expect, it } from "bun:test";

import {
	act,
	fireEvent,
	screen,
	waitFor,
	within,
} from "@testing-library/react";

import { renderAppWithStub } from "#client/test-support/render-app";

import type { ReplayMetadataExample } from "./attempt-record-test-fixtures";
import {
	ADJACENT_REPETITIONS,
	REPLAY_METADATA_EXAMPLES,
	standaloneRow,
	workflowRep,
} from "./attempt-record-test-fixtures";
import AttemptWorkspacePage from "./attempt-workspace";
import {
	originalFetch,
	replayEvidenceRoutes,
	show,
} from "./attempt-workspace-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe(AttemptWorkspacePage.name, () => {
	it.each([...REPLAY_METADATA_EXAMPLES])(
		"qualifies missing outputs with $metadata identity",
		qualifiesMissingComparisonOutputs,
	);
	it.each([...REPLAY_METADATA_EXAMPLES])(
		"reads the replay result with $metadata identity",
		readsReplayMetadataResult,
	);
	it.each([...REPLAY_METADATA_EXAMPLES])(
		"compares source and replay with $metadata identity",
		opensReplayMetadataComparison,
	);

	it(
		"shows a pipeline rep's step and independently judged final outcome",
		showsAPipelineRepSStepAndIndependentlyJudgedFinalOutcome,
	);

	it(
		"shows a stage rep's own result without a final workflow outcome",
		showsAStageRepSOwnResultWithoutAFinalWorkflowOutcome,
	);

	it(
		"does not offer invented session context for a workflow rep",
		doesNotOfferInventedSessionContextForAWorkflowRep,
	);

	it(
		"renders saved JSON as text when requested",
		rendersSavedJSONAsTextWhenRequested,
	);

	it(
		"preserves the selected step, view and comparison across adjacent group attempts",
		preservesTheSelectedStepViewAndComparisonAcrossAdjacentGroupAttempts,
	);
});

async function showsAPipelineRepSStepAndIndependentlyJudgedFinalOutcome(): Promise<void> {
	show(
		{ groupId: "group-a", kind: "confirmation", repId: "group-a-rep-1" },
		"results",
		new Map([
			[
				"/api/groups/group-a/reps/group-a-rep-1/attempt/result",
				workflowRep("pipeline"),
			],
		]),
	);

	expect(await screen.findByText("Grade A · CONTINUE")).toBeTruthy();
	expect(screen.getByText("PASS")).toBeTruthy();
	expect(screen.getByText("$0.04")).toBeTruthy();
	expect(screen.getByText("00:40")).toBeTruthy();
	expect(
		screen.getByRole("button", { name: "Show parsed saved result JSON" }),
	).toBeTruthy();
}

async function showsAStageRepSOwnResultWithoutAFinalWorkflowOutcome(): Promise<void> {
	const identity = {
		groupId: "group-a",
		kind: "confirmation",
		repId: "group-a-rep-1",
	} as const;
	const routes = new Map<string, unknown>([
		[
			"/api/groups/group-a/reps/group-a-rep-1/attempt/result",
			workflowRep("stage"),
		],
	]);
	show(identity, "results", routes);
	expect(await screen.findByText("Grade A · CONTINUE")).toBeTruthy();
	expect(screen.queryByText("Final workflow outcome")).toBeNull();
}

async function doesNotOfferInventedSessionContextForAWorkflowRep(): Promise<void> {
	show(
		{ groupId: "group-a", kind: "confirmation", repId: "group-a-rep-1" },
		"context",
		new Map([
			[
				"/api/groups/group-a/reps/group-a-rep-1/attempt/result",
				workflowRep("pipeline"),
			],
		]),
	);
	expect(
		await screen.findByText(/pipeline rep has no saved session context view/u),
	).toBeTruthy();
	expect(screen.queryByText("Context & cost · saved evidence")).toBeNull();
}

async function rendersSavedJSONAsTextWhenRequested(): Promise<void> {
	show(
		{ caseId: "case-a", kind: "standalone", uuid: "attempt-a" },
		"results",
		new Map([
			["/api/runs", { launches: [], rows: [standaloneRow()], unreadable: [] }],
			[
				"/api/records/attempt%3Asession%3Acase-a%2Fattempt-a",
				{ reply: "<script>alert(1)</script>" },
			],
		]),
	);
	fireEvent.click(
		await screen.findByRole("button", { name: "Show saved record JSON" }),
	);
	const record = await screen.findByTestId("saved-record-json");
	expect(record.textContent).toContain("<script>alert(1)</script>");
	expect(record.querySelector("script")).toBeNull();
}

async function preservesTheSelectedStepViewAndComparisonAcrossAdjacentGroupAttempts(): Promise<void> {
	renderAppWithStub(
		"/groups/group-a/reps/group-a-rep-1/attempt?view=context&step=build&comparison=comparison-a",
		new Map<string, unknown>([
			["/api/groups/group-a/attempts", ADJACENT_REPETITIONS],
			[
				"/api/groups/group-a/reps/group-a-rep-1/attempt/result",
				workflowRep("pipeline"),
			],
			[
				"/api/groups/group-a/reps/group-a-rep-2/attempt/result",
				{ ...workflowRep("pipeline"), ordinal: 2, repId: "group-a-rep-2" },
			],
		]),
	);
	expect(await screen.findByText("Attempt 1 of 2 · build")).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: "Previous attempt" }),
	).toBeDisabled();

	expect(screen.getByRole("link", { name: "Next attempt" })).toHaveAttribute(
		"href",
		"/groups/group-a/reps/group-a-rep-2/attempt?view=context&step=build&comparison=comparison-a",
	);
	fireEvent.click(screen.getByRole("link", { name: "Next attempt" }));
	expect(await screen.findByText("Attempt 2 of 2 · build")).toBeInTheDocument();
	expect(screen.getByRole("button", { name: "Next attempt" })).toBeDisabled();
	expect(
		screen.getByRole("link", { name: "Previous attempt" }),
	).toHaveAttribute(
		"href",
		"/groups/group-a/reps/group-a-rep-1/attempt?view=context&step=build&comparison=comparison-a",
	);
	expect(screen.getByRole("link", { name: "Group results" })).toHaveAttribute(
		"href",
		"/groups/group-a?view=attempts&step=build&comparison=comparison-a",
	);
	expect(
		screen.getByRole("link", { name: "Back to comparison" }),
	).toHaveAttribute("href", "/comparisons/comparison-a");
}

async function readsReplayMetadataResult({
	row,
	title,
}: ReplayMetadataExample): Promise<void> {
	show(
		{
			kind: "replay",
			lineage: "lineage-a",
			timestamp: "2026-10-01T12:00:00Z",
		},
		"results",
		replayEvidenceRoutes(row),
	);

	expect(await screen.findByText(/Grade B · CONTINUE/u)).toBeTruthy();

	expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();

	expect(
		screen.getByText("Execution ended · A replay grades only this step."),
	).toBeTruthy();

	expect(screen.queryByText("Final workflow outcome")).toBeNull();
}

async function opensReplayMetadataComparison({
	row,
	caseLabel,
	idLabel,
}: ReplayMetadataExample): Promise<void> {
	show(
		{
			kind: "replay",
			lineage: "lineage-a",
			timestamp: "2026-10-01T12:00:00Z",
		},
		"results",
		replayEvidenceRoutes(row),
	);
	const compare = await screen.findByRole("button", {
		name: "Compare with source",
	});
	await act(async () => {
		fireEvent.click(compare);
		await Promise.resolve();
	});
	const sourceStepLink = await screen.findByRole("link", {
		name: "Source step",
	});
	const dialog = screen.getByRole("dialog");
	expect(
		within(dialog).getByRole("heading", {
			name: `Source Source run · ${caseLabel} · build`,
		}),
	).toBeInTheDocument();
	expect(
		within(dialog).getByRole("heading", {
			name: `Replay ${idLabel} · ${caseLabel} · build`,
		}),
	).toBeInTheDocument();
	expect(sourceStepLink.getAttribute("href")).toBe(
		"/runs/source-run?view=results&step=build",
	);
}

async function qualifiesMissingComparisonOutputs({
	row,
}: ReplayMetadataExample): Promise<void> {
	show(
		{
			kind: "replay",
			lineage: "lineage-a",
			timestamp: "2026-10-01T12:00:00Z",
		},
		"results",
		replayEvidenceRoutes(row),
	);
	const compare = await screen.findByRole("button", {
		name: "Compare with source",
	});
	await act(async () => {
		fireEvent.click(compare);
		await Promise.resolve();
	});
	await screen.findByRole("link", {
		name: "Source step",
	});
	await waitFor(() => {
		const expectedMatchingElementsCount = 2;

		expect(
			screen.getAllByText("Output unavailable in this saved record."),
		).toHaveLength(expectedMatchingElementsCount);
	});
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: "Close" }));
		await Promise.resolve();
	});
}
