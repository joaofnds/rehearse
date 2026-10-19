import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, waitFor } from "@testing-library/react";

import { runHistoryReplies } from "#client/test-support/fetch-stub";
import { renderAppWithStub } from "#client/test-support/render-app";
import {
	RunRecordBuilder,
	RunRecordStageBuilder,
} from "#client/test-support/run-detail";

import GroupWorkspacePage from "./group-workspace";
import {
	GROUP,
	RUN,
	group,
	originalFetch,
	serve,
} from "./group-workspace-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe(GroupWorkspacePage.name, () => {
	it(
		"keeps Runs filters when returning explicitly from a group",
		keepsRunsFiltersWhenReturningExplicitlyFromAGroup,
	);

	it(
		"names a source step absent from the saved run",
		namesASourceStepAbsentFromTheSavedRun,
	);

	it(
		"keeps missing source costs explicit instead of filling them with zero",
		keepsMissingSourceCostsExplicitInsteadOfFillingThemWithZero,
	);

	it(
		"shows a source-read error while retaining the group results",
		showsASourceReadErrorWhileRetainingTheGroupResults,
	);

	it(
		"reports a group absent from history without inventing evidence",
		reportsAGroupAbsentFromHistoryWithoutInventingEvidence,
	);
});

async function keepsRunsFiltersWhenReturningExplicitlyFromAGroup(): Promise<void> {
	const fetchReplies = new Map<string, unknown>([
		...runHistoryReplies({ launches: [], rows: [group()], unreadable: [] }),
		[`/api/groups/${GROUP}/reads`, { reasons: [], reps: [] }],
	]);
	const router = renderAppWithStub(
		"/?query=audit-log&kind=group&status=ended",
		fetchReplies,
	);
	fireEvent.click(await screen.findByRole("link", { name: "g1" }));
	fireEvent.click(await screen.findByRole("link", { name: "← Runs" }));

	await waitFor(() => {
		expect(router.state.location.pathname).toBe("/");
		expect(router.state.location.search).toMatchObject({
			kind: "group",
			query: "audit-log",
			status: "ended",
		});
	});
	expect(
		await screen.findByRole("searchbox", { name: "Search runs" }),
	).toHaveValue("audit-log");
}

async function namesASourceStepAbsentFromTheSavedRun(): Promise<void> {
	serve(group({ checkpoint: { run: RUN, stage: "deploy" } }));
	expect(
		await screen.findByText("The source run records no deploy step."),
	).toBeInTheDocument();
}

async function keepsMissingSourceCostsExplicitInsteadOfFillingThemWithZero(): Promise<void> {
	const sourceGroup = group();
	const sourceRecord = new RunRecordBuilder({
		run: RUN,
		stages: [
			new RunRecordStageBuilder({
				judgeCost: {
					reasons: ["judge metrics absent"],
					state: "unavailable",
				},

				sessionCost: { state: "available", usd: 1.2 },

				stage: "build",

				status: "graded",
			}).build(),
		],
	}).build();
	serve(sourceGroup, {
		extra: new Map([[`/api/runs/${RUN}`, sourceRecord]]),
		reads: undefined,
	});
	expect(await screen.findByText(/^Source step build:/u)).toHaveTextContent(
		"Worker + Judge session $1.20 · judge cost not recorded: judge metrics absent",
	);
}

async function showsASourceReadErrorWhileRetainingTheGroupResults(): Promise<void> {
	serve(group(), {
		extra: new Map([[`/api/runs/${RUN}`, undefined]]),
		reads: undefined,
	});
	expect(await screen.findByRole("alert")).toHaveTextContent(
		"Source step unavailable",
	);
	expect(
		screen.getByRole("heading", { name: "Step results" }),
	).toBeInTheDocument();
}

async function reportsAGroupAbsentFromHistoryWithoutInventingEvidence(): Promise<void> {
	serve(group({ groupId: "other" }));
	expect(await screen.findByRole("alert")).toHaveTextContent(
		"No saved group group-a was found",
	);
}
