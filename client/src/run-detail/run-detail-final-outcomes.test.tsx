import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, within } from "@testing-library/react";

import NamedHistoryBuilder from "#client/run-history/run-history-page-named-history-builder";
import { renderAppWithStub } from "#client/test-support/render-app";
import {
	RUN,
	renderContribution,
	renderRunDetail,
	stoppedAtBuild,
	stoppedRow,
} from "#client/test-support/run-detail";
import type { RunRecord } from "#server/run-record";

import { originalFetch } from "./run-detail-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("/runs/$run", () => {
	it(
		"shows which steps kept checkpoints when workflow details expand",
		showsWhichStepsKeptCheckpointsWhenWorkflowDetailsExpand,
	);

	it(
		"grades the task on its own and never shows a letter the final judge did not return",
		gradesTheTaskOnItsOwnAndNeverShowsALetterTheFinalJudgeDidNotReturn,
	);

	it.each([
		[{ status: "JUDGED", verdict: "PASS" }, "PASS", "graded independently"],
		[
			{ reason: "the judge timed out", status: "JUDGING_FAILED" },
			"—",
			"judging failed · the judge timed out",
		],
		[
			{ stage: "verify", status: "PENDING" },
			"—",
			"pending · the run is at verify",
		],
		[
			{ reason: "the run stopped", stage: "verify", status: "NOT_REACHED" },
			"—",
			"not reached · the run stopped",
		],
	] as const)(
		"reads a %o final outcome as its verdict or a dash with the reason",
		readsFinalOutcome,
	);

	it.each(["rail", "ledger", "trace"])(
		"opens an old %s layout link on Results",
		opensLegacyLayout,
	);

	it(
		"keeps checkpoint information visible after a run completes",
		keepsCheckpointInformationVisibleAfterARunCompletes,
	);
});

async function showsWhichStepsKeptCheckpointsWhenWorkflowDetailsExpand(): Promise<void> {
	renderRunDetail();

	const graph = await screen.findByRole("region", { name: "Task graph" });
	fireEvent.click(
		within(graph).getByRole("button", {
			name: "Show workflow details",
		}),
	);
	expect(
		within(graph).getByRole("button", { name: /^shape/u }),
	).toHaveTextContent("checkpoint recorded");
	expect(
		within(graph).getByRole("button", { name: /^build/u }),
	).toHaveTextContent("no checkpoint recorded");
}

async function gradesTheTaskOnItsOwnAndNeverShowsALetterTheFinalJudgeDidNotReturn(): Promise<void> {
	renderContribution();

	const card = await screen.findByRole("region", {
		name: "Final outcome · independent task Judge",
	});

	expect(card).toHaveTextContent(
		"not reached · the run stopped before the final judge",
	);
	expect(card).toHaveTextContent(
		"It does not read the intermediate steps, so it cannot grade a run that stopped early.",
	);
	expect(within(card).queryByText(/^[A-F][+-]?$/u)).not.toBeInTheDocument();
}

async function keepsCheckpointInformationVisibleAfterARunCompletes(): Promise<void> {
	const fetchReplies = new Map<string, unknown>([
		[
			"/api/runs",
			new NamedHistoryBuilder({
				rows: [{ ...stoppedRow(), status: "SUCCESSFUL" }],
			}).build(),
		],
		[`/api/runs/${RUN}`, stoppedAtBuild()],
	]);
	renderAppWithStub(`/runs/${RUN}`, fetchReplies);

	const graph = await screen.findByRole("region", { name: "Task graph" });
	fireEvent.click(
		within(graph).getByRole("button", {
			name: "Show workflow details",
		}),
	);
	expect(
		within(graph).getByRole("button", { name: /^shape/u }),
	).toHaveTextContent("checkpoint recorded");
}

async function readsFinalOutcome(
	finalOutcome: RunRecord["finalOutcome"],
	value: string,
	note: string,
): Promise<void> {
	renderContribution(
		new Map([[`/api/runs/${RUN}`, { ...stoppedAtBuild(), finalOutcome }]]),
	);

	const card = await screen.findByRole("region", {
		name: "Final outcome · independent task Judge",
	});

	expect(within(card).getByText(value)).toBeInTheDocument();
	expect(within(card).getByText(note)).toBeInTheDocument();
}

async function opensLegacyLayout(layout: string): Promise<void> {
	renderRunDetail(new Map(), [], `/runs/${RUN}?layout=${layout}`);

	expect(
		await screen.findByRole("button", { name: "Results" }),
	).toHaveAttribute("aria-pressed", "true");
	expect(
		await screen.findByRole("region", {
			name: "Final outcome · independent task Judge",
		}),
	).toBeInTheDocument();
}
