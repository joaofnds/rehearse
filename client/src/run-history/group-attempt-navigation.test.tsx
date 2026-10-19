import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, within } from "@testing-library/react";

import GroupWorkspacePage from "./group-workspace";
import {
	GROUP,
	UNGRADED_REPETITION,
	UNGRADED_REP_ID,
	group,
	originalFetch,
	serve,
} from "./group-workspace-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe(GroupWorkspacePage.name, () => {
	it(
		"shows each attempt's real context link or unavailable reason",
		showsEachAttemptSRealContextLinkOrUnavailableReason,
	);

	it(
		"names a keyboard-scrollable region for the group attempts table",
		namesAKeyboardScrollableRegionForTheGroupAttemptsTable,
	);

	it(
		"keeps exact repetition identity in collapsed inspectable provenance beside its result destination",
		keepsExactRepetitionIdentityInCollapsedInspectableProvenanceBesideItsResultDestination,
	);

	it(
		"links stage rep results even when session context is unavailable",
		linksStageRepResultsEvenWhenSessionContextIsUnavailable,
	);

	it(
		"keeps an ungraded repetition's own missing cost and evidence qualification in one row",
		keepsAnUngradedRepetitionSOwnMissingCostAndEvidenceQualificationInOneRow,
	);
});

async function showsEachAttemptSRealContextLinkOrUnavailableReason(): Promise<void> {
	serve(
		group({
			checkpoint: undefined,
			links: [
				{
					href: `/groups/${GROUP}/reps/rep-1/attempt`,
					label: "rep 1",
					state: "available",
				},
				{
					label: "rep 2",
					reason: "no attempt recorded for rep-2",
					state: "unavailable",
				},
			],
			mode: "session",
		}),
	);

	fireEvent.click(await screen.findByRole("button", { name: "Attempts" }));
	await screen.findByRole("table", { name: "Group attempts" });
	expect(
		within(screen.getByRole("table", { name: "Group attempts" })).getByRole(
			"link",
			{ name: "Results" },
		),
	).toHaveAttribute("href", `/groups/${GROUP}/reps/rep-1/attempt?view=results`);
	const list = screen.getByRole("table", { name: "Group attempts" });
	expect(
		within(list).getByRole("link", { name: "Context & cost" }),
	).toHaveAttribute("href", `/groups/${GROUP}/reps/rep-1/attempt?view=context`);
	expect(
		screen.getByText(/no attempt recorded for rep-2/u),
	).toBeInTheDocument();
	expect(screen.getByText(/record unreadable/u)).toBeInTheDocument();
}

async function namesAKeyboardScrollableRegionForTheGroupAttemptsTable(): Promise<void> {
	serve(group());

	fireEvent.click(await screen.findByRole("button", { name: "Attempts" }));

	const region = await screen.findByRole("region", {
		name: "Group attempts Scrollable table",
	});
	expect(region).toHaveAttribute("tabindex", "0");
	region.focus();
	expect(region).toHaveFocus();
	expect(
		within(region).getByRole("table", { name: "Group attempts" }),
	).toBeInTheDocument();
}

async function keepsExactRepetitionIdentityInCollapsedInspectableProvenanceBesideItsResultDestination(): Promise<void> {
	serve(group());

	fireEvent.click(await screen.findByRole("button", { name: "Attempts" }));

	const table = await screen.findByRole("table", { name: "Group attempts" });
	const summary = within(table).getByText("Repetition ID");
	const disclosure = summary.closest("details");
	expect(disclosure).not.toHaveAttribute("open");
	expect(disclosure).toHaveTextContent("rep-1");
	fireEvent.click(summary);
	expect(disclosure).toHaveAttribute("open");
	expect(within(table).getByRole("link", { name: "Results" })).toHaveAttribute(
		"href",
		`/groups/${GROUP}/reps/rep-1/attempt?view=results`,
	);
}

async function linksStageRepResultsEvenWhenSessionContextIsUnavailable(): Promise<void> {
	serve(group());
	fireEvent.click(await screen.findByRole("button", { name: "Attempts" }));
	await screen.findByRole("table", { name: "Group attempts" });
	expect(
		within(screen.getByRole("table", { name: "Group attempts" })).getByRole(
			"link",
			{ name: "Results" },
		),
	).toHaveAttribute("href", `/groups/${GROUP}/reps/rep-1/attempt?view=results`);
	expect(
		screen.getByText(/a stage group has no session context/u),
	).toBeInTheDocument();
}

async function keepsAnUngradedRepetitionSOwnMissingCostAndEvidenceQualificationInOneRow(): Promise<void> {
	serve(group({ repAttempts: [] }), {
		extra: new Map<string, unknown>([
			[
				"/api/groups/group-a/attempts",
				{
					groupId: GROUP,
					repRecords: [{ ordinal: 2, repId: UNGRADED_REP_ID }],
				},
			],
			[
				`/api/groups/${GROUP}/reps/${UNGRADED_REP_ID}/attempt/result`,
				UNGRADED_REPETITION,
			],
		]),
		reads: undefined,
	});
	fireEvent.click(await screen.findByRole("button", { name: "Attempts" }));
	const table = await screen.findByRole("table", { name: "Group attempts" });
	expect(
		await within(table).findByText("build: NOT REACHED"),
	).toBeInTheDocument();
	expect(within(table).getByText("Repetition 2")).toBeInTheDocument();
	expect(within(table).getByText("Cost unavailable")).toBeInTheDocument();
	expect(within(table).getByText("00:12")).toBeInTheDocument();
	expect(within(table).getByText("worker metrics absent")).toBeInTheDocument();
	expect(
		within(table).queryByText(/Checks failed|Grade F/u),
	).not.toBeInTheDocument();
	expect(within(table).getByRole("link", { name: "Results" })).toHaveAttribute(
		"href",
		`/groups/${GROUP}/reps/${UNGRADED_REP_ID}/attempt?view=results`,
	);
}
