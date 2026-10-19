import { afterEach, describe, expect, it, setSystemTime } from "bun:test";

import { within } from "@testing-library/react";

import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import FakeEventSource from "#client/test-support/event-source";
import { SHELL_BASELINE } from "#client/test-support/render-app";

import {
	BUILD_SESSION,
	RUNNING_SESSION,
	queuedBodies,
	renderSession,
	rowCells,
	selectReview,
	sessionPane,
} from "./monitor-session-test-fixtures";
import {
	RUN,
	graphNode,
	monitorBodies,
	originalFetch,
	renderMonitor,
	stubFetchByPath,
} from "./monitor-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
	setSystemTime();
});

describe("/monitor session pane", () => {
	it(
		"shows the running stage's transcript tail, each row with its line, kind and text",
		showsTheRunningStageSTranscriptTailEachRowWithItsLineKindAndText,
	);

	describe("for a stage not started yet", () => {
		it("says the step has not started", saysTheStepHasNotStarted);

		it(
			"shows the step's tail once a run event arrives after it starts",
			showsTheStepSTailOnceARunEventArrivesAfterItStarts,
		);
	});

	it(
		"says a step's transcript cannot be found when its start recorded no session id",
		saysAStepSTranscriptCannotBeFoundWhenItsStartRecordedNoSessionId,
	);

	it(
		"says when it could not read the step's session",
		saysWhenItCouldNotReadTheStepSSession,
	);

	it(
		"shows the running stage's latest tool call on its node",
		showsTheRunningStageSLatestToolCallOnItsNode,
	);

	it(
		"shows no tool call on a finished stage's node",
		showsNoToolCallOnAFinishedStageSNode,
	);
});

async function saysWhenItCouldNotReadTheStepSSession(): Promise<void> {
	renderMonitor(
		new PipelineRunRowBuilder({ run: RUN })
			.withExecutionProgress({ stage: "build" })
			.build(),
	);

	expect(
		await within(await sessionPane()).findByRole("alert"),
	).toHaveTextContent("Could not read this step's session.");
}

async function showsTheRunningStageSTranscriptTailEachRowWithItsLineKindAndText(): Promise<void> {
	renderSession(RUNNING_SESSION);

	expect(await rowCells()).toEqual([
		["1278", "tool", "Bash  pnpm test auth"],
		["1281", "result", "44 passed, 0 failed"],
		["1284", "assistant", "Tests pass."],
	]);
	expect(await sessionPane()).toHaveTextContent(
		"session running · 1,284 lines",
	);
}

async function saysTheStepHasNotStarted(): Promise<void> {
	renderMonitor(
		new PipelineRunRowBuilder({ run: RUN })
			.withExecutionProgress({ stage: "build" })
			.build(),
		queuedBodies({ state: "not-started" }),
	);

	await selectReview();

	expect(
		await within(await sessionPane()).findByText(
			"This step has not started yet.",
		),
	).toBeInTheDocument();
}

async function showsTheStepSTailOnceARunEventArrivesAfterItStarts(): Promise<void> {
	const expectedRowCellCount = 3;

	const row = new PipelineRunRowBuilder({ run: RUN })
		.withExecutionProgress({ stage: "build" })
		.build();
	renderMonitor(row, queuedBodies({ state: "not-started" }));
	await selectReview();
	const pane = await sessionPane();
	await within(pane).findByText("This step has not started yet.");
	stubFetchByPath(
		new Map<string, unknown>([
			...SHELL_BASELINE,
			...monitorBodies(row),
			...queuedBodies(RUNNING_SESSION),
		]),
	);

	FakeEventSource.openOn(`/api/runs/${RUN}/events`).deliver();

	expect(await rowCells()).toHaveLength(expectedRowCellCount);
}

async function saysAStepSTranscriptCannotBeFoundWhenItsStartRecordedNoSessionId(): Promise<void> {
	renderSession({ state: "untracked" });

	expect(
		await within(await sessionPane()).findByText(
			"This step's session id was not recorded, so its transcript cannot be found.",
		),
	).toBeInTheDocument();
}

async function showsTheRunningStageSLatestToolCallOnItsNode(): Promise<void> {
	renderSession(RUNNING_SESSION);

	const build = await graphNode("build");

	expect(
		await within(build).findByText(/^Bash\s+pnpm test auth$/u),
	).toHaveClass("truncate");
}

async function showsNoToolCallOnAFinishedStageSNode(): Promise<void> {
	renderMonitor(
		new PipelineRunRowBuilder({ run: RUN })
			.withExecutionProgress({ stage: "build" })
			.build(),
		new Map<string, unknown>([
			[`/api/runs/${RUN}/stages/plan/session`, RUNNING_SESSION],
			[BUILD_SESSION, RUNNING_SESSION],
		]),
	);

	await within(await graphNode("build")).findByText(/^Bash\s+pnpm test auth$/u);

	expect(await graphNode("plan")).not.toHaveTextContent("Bash");
}
