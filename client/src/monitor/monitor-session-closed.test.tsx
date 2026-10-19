import { afterEach, describe, expect, it, setSystemTime } from "bun:test";

import { within } from "@testing-library/react";

import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import FakeEventSource from "#client/test-support/event-source";
import { SHELL_BASELINE } from "#client/test-support/render-app";

import {
	CITED_SESSION,
	TRANSCRIPT_PATH,
	closedBodies,
	renderClosed,
	rowCells,
	selectPlan,
	sessionPane,
} from "./monitor-session-test-fixtures";
import {
	RUN,
	monitorBodies,
	originalFetch,
	stubFetchByPath,
} from "./monitor-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
	setSystemTime();
});

describe("/monitor session pane", () => {
	describe("for a finished stage", () => {
		it(
			"shows the spans its judge cites, the session's figures, and its transcript on disk",
			showsTheSpansItsJudgeCitesTheSessionSFiguresAndItsTranscriptOnDisk,
		);

		it(
			"says when the run kept no copy of the stage's transcript",
			saysWhenTheRunKeptNoCopyOfTheStageSTranscript,
		);

		it(
			"shows the transcript's copy once a run event arrives after the step checkpoints",
			showsTheTranscriptSCopyOnceARunEventArrivesAfterTheStepCheckpoints,
		);
	});
});

async function showsTheSpansItsJudgeCitesTheSessionSFiguresAndItsTranscriptOnDisk(): Promise<void> {
	renderClosed(CITED_SESSION);

	await selectPlan();

	expect(await rowCells()).toEqual([
		["ex 1", "assistant", "Which scope?"],
		["ex 1", "user", "Use the small scope"],
		["", "cited", "The owner chose the small scope"],
	]);
	const pane = await sessionPane();
	expect(pane).toHaveTextContent(
		"session closed · 1,284 lines · 4m02s · $1.12",
	);
	expect(
		within(pane).getByRole("link", { name: "open transcript" }),
	).toHaveAttribute("href", `/runs/${RUN}?view=context&step=plan&focus=events`);
	expect(pane).toHaveTextContent(
		"Session ended. Inspect the saved transcript in Context & cost.",
	);
	expect(
		within(pane).getByRole("link", {
			name: `.benchmark-runs/${RUN}.checkpoints/plan/transcript.jsonl`,
		}),
	).toHaveAttribute("href", `/runs/${RUN}?view=context&step=plan&focus=events`);
}

async function saysWhenTheRunKeptNoCopyOfTheStageSTranscript(): Promise<void> {
	renderClosed({ spans: [], state: "closed" });

	await selectPlan();

	const pane = await sessionPane();
	expect(
		await within(pane).findByText(
			"Session ended. Rehearse has no copy of its transcript, which it keeps only once the step checkpoints.",
		),
	).toBeInTheDocument();
	expect(
		within(pane).queryByRole("link", { name: "open transcript" }),
	).not.toBeInTheDocument();
}

async function showsTheTranscriptSCopyOnceARunEventArrivesAfterTheStepCheckpoints(): Promise<void> {
	const row = new PipelineRunRowBuilder({ run: RUN })
		.withExecutionProgress({ stage: "build" })
		.build();
	renderClosed({ spans: [], state: "closed" });
	await selectPlan();
	const pane = await sessionPane();
	await within(pane).findByText(/^Session ended\./u);
	stubFetchByPath(
		new Map<string, unknown>([
			...SHELL_BASELINE,
			...monitorBodies(row),
			...closedBodies({
				lineCount: 1284,
				spans: [],
				state: "closed",
				transcriptPath: TRANSCRIPT_PATH,
			}),
		]),
	);

	FakeEventSource.openOn(`/api/runs/${RUN}/events`).deliver();

	expect(
		await within(pane).findByRole("link", { name: TRANSCRIPT_PATH }),
	).toBeInTheDocument();
}
