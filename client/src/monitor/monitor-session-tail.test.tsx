import {
	afterEach,
	describe,
	expect,
	it,
	onTestFinished,
	setSystemTime,
} from "bun:test";

import { fireEvent, waitFor, within } from "@testing-library/react";

import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import {
	RunRecordBuilder,
	RunRecordStageBuilder,
} from "#client/test-support/run-detail";

import {
	BUILD_SESSION,
	RUNNING_SESSION,
	pressKey,
	renderSession,
	sessionBody,
	sessionPane,
} from "./monitor-session-test-fixtures";
import {
	RUN,
	originalFetch,
	renderMonitor,
	selectStage,
} from "./monitor-test-fixtures";

const lowerBoundForDown = 200;

const upperBoundForScrollTop = 200;

const expectedScrollTop = 200;

afterEach(() => {
	globalThis.fetch = originalFetch;
	setSystemTime();
});

describe("/monitor session pane", () => {
	describe("following the tail", () => {
		it(
			"keeps the transcript independently scrollable inside the workspace",
			keepsTheTranscriptIndependentlyScrollableInsideTheWorkspace,
		);

		it(
			"follows the tail, counting the tool calls it collapsed, until f unfollows it",
			followsTheTailCountingTheToolCallsItCollapsedUntilFUnfollowsIt,
		);

		it(
			"toggles the tail once while f is held down",
			togglesTheTailOnceWhileFIsHeldDown,
		);

		it(
			"returns to the tail when f follows it again",
			returnsToTheTailWhenFFollowsItAgain,
		);

		it(
			"scrolls the pane down with j and up with k",
			scrollsThePaneDownWithJAndUpWithK,
		);

		it(
			"leaves the tail when k scrolls up from it",
			leavesTheTailWhenKScrollsUpFromIt,
		);

		it("ignores f, j and k typed into a field", ignoresFJAndKTypedIntoAField);

		it(
			"leaves f to the browser when a modifier is held",
			leavesFToTheBrowserWhenAModifierIsHeld,
		);

		it(
			"opens the next stage it shows at its tail",
			opensTheNextStageItShowsAtItsTail,
		);
	});
});

async function keepsTheTranscriptIndependentlyScrollableInsideTheWorkspace(): Promise<void> {
	renderSession(RUNNING_SESSION);

	const body = await sessionBody();
	expect(body).toHaveClass("overflow-y-auto");
}

async function followsTheTailCountingTheToolCallsItCollapsedUntilFUnfollowsIt(): Promise<void> {
	renderSession(RUNNING_SESSION);
	const pane = await sessionPane();
	await sessionBody();

	expect(pane).toHaveTextContent(
		"Following tail · j/k to scroll, f to unfollow",
	);
	expect(pane).toHaveTextContent("tool calls collapsed (1)");

	pressKey("f");

	expect(pane).toHaveTextContent("Tail paused · j/k to scroll, f to follow");
}

async function togglesTheTailOnceWhileFIsHeldDown(): Promise<void> {
	renderSession(RUNNING_SESSION);
	const pane = await sessionPane();
	await sessionBody();

	pressKey("f");
	fireEvent.keyDown(document.body, { key: "f", repeat: true });

	expect(pane).toHaveTextContent("Tail paused");
}

async function returnsToTheTailWhenFFollowsItAgain(): Promise<void> {
	renderSession(RUNNING_SESSION);
	const body = await sessionBody();
	Object.defineProperty(body, "scrollHeight", { value: 900 });
	pressKey("f");
	body.scrollTop = 0;

	pressKey("f");

	await waitFor(() => {
		const tailPosition = 900;

		expect(body.scrollTop).toBe(tailPosition);
	});
}

async function scrollsThePaneDownWithJAndUpWithK(): Promise<void> {
	renderSession(RUNNING_SESSION);
	const body = await sessionBody();
	pressKey("f");
	body.scrollTop = 200;

	pressKey("j");
	const down = body.scrollTop;
	pressKey("k");
	pressKey("k");

	expect(down).toBeGreaterThan(lowerBoundForDown);
	expect(body.scrollTop).toBeLessThan(upperBoundForScrollTop);
}

async function leavesTheTailWhenKScrollsUpFromIt(): Promise<void> {
	renderSession(RUNNING_SESSION);
	const pane = await sessionPane();
	await sessionBody();

	pressKey("k");

	expect(pane).toHaveTextContent("Tail paused · j/k to scroll, f to follow");
}

async function ignoresFJAndKTypedIntoAField(): Promise<void> {
	renderSession(RUNNING_SESSION);
	const body = await sessionBody();
	const field = document.createElement("input");
	document.body.append(field);
	onTestFinished(() => {
		field.remove();
	});
	body.scrollTop = 200;

	for (const key of ["f", "j", "k"]) {
		fireEvent.keyDown(field, { key });
	}

	expect(await sessionPane()).toHaveTextContent("Following tail");
	expect(body.scrollTop).toBe(expectedScrollTop);
}

async function leavesFToTheBrowserWhenAModifierIsHeld(): Promise<void> {
	renderSession(RUNNING_SESSION);
	const pane = await sessionPane();
	await sessionBody();

	fireEvent.keyDown(document.body, { key: "f", metaKey: true });
	fireEvent.keyDown(document.body, { ctrlKey: true, key: "f" });
	fireEvent.keyDown(document.body, { altKey: true, key: "f" });

	expect(pane).toHaveTextContent("Following tail");
}

async function opensTheNextStageItShowsAtItsTail(): Promise<void> {
	const monitorRow = new PipelineRunRowBuilder({ run: RUN })
		.withExecutionProgress({ stage: "build" })
		.build();
	const fetchOverrides = new Map<string, unknown>([
		[
			`/api/runs/${RUN}`,
			new RunRecordBuilder({
				run: RUN,
				stages: [
					new RunRecordStageBuilder({ stage: "plan" }).build(),
					new RunRecordStageBuilder().build(),
				],
			}).build(),
		],
		[`/api/runs/${RUN}/stages/plan/session`, RUNNING_SESSION],
		[BUILD_SESSION, RUNNING_SESSION],
	]);
	renderMonitor(monitorRow, fetchOverrides);
	await sessionBody();
	pressKey("f");

	await selectStage("plan");

	const pane = await sessionPane();
	await within(pane).findByText(/^Step 1 · plan$/u);
	expect(pane).toHaveTextContent("Following tail");
}
