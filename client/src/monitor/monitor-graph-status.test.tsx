import { afterEach, describe, expect, it, setSystemTime } from "bun:test";

import { screen, within } from "@testing-library/react";

import NamedHistoryBuilder from "#client/run-history/run-history-page-named-history-builder";
import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import {
	RunRecordBuilder,
	RunRecordStageBuilder,
} from "#client/test-support/run-detail";

import { PLAN_GRADED_STAGE, renderGraph } from "./monitor-graph-test-fixtures";
import {
	RUN,
	graphNode,
	originalFetch,
	paneTitles,
	renderAppWithStub,
	renderMonitor,
	selectStage,
} from "./monitor-test-fixtures";

const BUILD_NO_RECORD_STAGE = new RunRecordStageBuilder({
	stage: "build",
}).build();

afterEach(() => {
	globalThis.fetch = originalFetch;
	setSystemTime();
});

describe("/monitor task graph", () => {
	it(
		"draws the running stage's pulsing glyph in its status line's colour, as the design does",
		drawsTheRunningStageSPulsingGlyphInItsStatusLineSColourAsTheDesignDoes,
	);

	it(
		"draws no hover fill on a node, as the design's node keeps its own background",
		drawsNoHoverFillOnANodeAsTheDesignSNodeKeepsItsOwnBackground,
	);

	it("shows a graded stage's letter", showsAGradedStageSLetter);

	it(
		"reads a stage whose letter falls short of the run's minimum as stopped, whatever its judge's verdict",
		readsAStageWhoseLetterFallsShortOfTheRunSMinimumAsStoppedWhateverItsJudgeSVerdict,
	);

	it(
		"reads a judged stage by its record once the record is written, as no longer running",
		readsAJudgedStageByItsRecordOnceTheRecordIsWrittenAsNoLongerRunning,
	);

	it(
		"reads a judged stage's cost and duration by its record once the record is written",
		readsAJudgedStageSCostAndDurationByItsRecordOnceTheRecordIsWritten,
	);

	it(
		"reads a stage waiting on its judge as awaiting judgment",
		readsAStageWaitingOnItsJudgeAsAwaitingJudgment,
	);

	it(
		"keeps graph nodes as step selectors while a run is active",
		keepsGraphNodesAsStepSelectorsWhileARunIsActive,
	);
});

describe("/monitor stage selection", () => {
	it(
		"marks the running stage and names it in the session and judge panes when no stage is selected",
		marksTheRunningStageAndNamesItInTheSessionAndJudgePanesWhenNoStageIsSelected,
	);

	it(
		"marks a selected stage and names it in the session and judge panes",
		marksASelectedStageAndNamesItInTheSessionAndJudgePanes,
	);
});

describe("/monitor under reduced motion", () => {
	it(
		"keeps every pulsing glyph static for readers who asked for reduced motion",
		keepsEveryPulsingGlyphStaticForReadersWhoAskedForReducedMotion,
	);
});

async function readsAJudgedStageByItsRecordOnceTheRecordIsWrittenAsNoLongerRunning(): Promise<void> {
	const fetchReplies = new Map<string, unknown>([
		[
			"/api/run-listing",
			new NamedHistoryBuilder({
				rows: [
					new PipelineRunRowBuilder({ run: RUN })
						.withExecutionProgress({ stage: "plan", stageState: "judged" })
						.build(),
				],
			}).build(),
		],
		[
			`/api/runs/${RUN}`,
			new RunRecordBuilder({
				finalOutcome: { stage: "plan", status: "PENDING" },
				run: RUN,
				stages: [PLAN_GRADED_STAGE, BUILD_NO_RECORD_STAGE],
			}).build(),
		],
	]);
	renderAppWithStub("/monitor", fetchReplies);

	const plan = await graphNode("plan");

	expect(plan).toHaveTextContent("✓Continued · minimum unavailable");
	expect(plan.querySelector("[class*='animate-live']")).toBeNull();
}

async function readsAJudgedStageSCostAndDurationByItsRecordOnceTheRecordIsWritten(): Promise<void> {
	setSystemTime(new Date("2026-09-30T10:07:12.000Z"));
	const fetchReplies = new Map<string, unknown>([
		[
			"/api/run-listing",
			new NamedHistoryBuilder({
				rows: [
					new PipelineRunRowBuilder({ run: RUN })
						.withExecutionProgress({
							measuredAt: "2026-09-30T10:06:12.000Z",
							stage: "plan",
							stageElapsedMs: 182_000,
							stageState: "judged",
						})
						.build(),
				],
			}).build(),
		],
		[
			`/api/runs/${RUN}`,
			new RunRecordBuilder({
				finalOutcome: { stage: "plan", status: "PENDING" },
				run: RUN,
				stages: [
					new RunRecordStageBuilder({
						judgeCost: { state: "available", usd: 0.3 },

						sessionCost: { state: "available", usd: 0.9 },

						stage: "plan",

						status: "graded",

						wallTime: { ms: 125_000, state: "available" },
					}).build(),
					BUILD_NO_RECORD_STAGE,
				],
			}).build(),
		],
	]);
	renderAppWithStub("/monitor", fetchReplies);

	const plan = await graphNode("plan");

	expect(plan).toHaveTextContent("$1.20");
	expect(plan).toHaveTextContent("2m05s");
}

async function marksTheRunningStageAndNamesItInTheSessionAndJudgePanesWhenNoStageIsSelected(): Promise<void> {
	renderMonitor(
		new PipelineRunRowBuilder({ run: RUN })
			.withExecutionProgress({ stage: "build" })
			.build(),
	);
	const graph = await screen.findByRole("region", { name: "Task graph" });

	expect(
		within(graph).getByRole("button", { current: "step" }),
	).toHaveTextContent("build");
	expect(await paneTitles()).toEqual(["Step 2 · build", "Judge · step 2"]);
}

async function marksASelectedStageAndNamesItInTheSessionAndJudgePanes(): Promise<void> {
	renderMonitor(
		new PipelineRunRowBuilder({ run: RUN })
			.withExecutionProgress({ stage: "build" })
			.build(),
	);

	await selectStage("plan");

	expect(
		within(screen.getByRole("region", { name: "Task graph" })).getByRole(
			"button",
			{ current: "step" },
		),
	).toHaveTextContent("plan");
	expect(await paneTitles()).toEqual(["Step 1 · plan", "Judge · step 1"]);
}

async function keepsEveryPulsingGlyphStaticForReadersWhoAskedForReducedMotion(): Promise<void> {
	const expectedPulsingCount = 0;

	renderMonitor(
		new PipelineRunRowBuilder({ run: RUN })
			.withExecutionProgress({ stage: "build" })
			.build(),
	);
	const graph = await screen.findByRole("region", { name: "Task graph" });
	const main = graph.closest("main");
	if (main === null) {
		throw new Error("the monitor renders outside the main landmark");
	}

	const pulsing = [...main.querySelectorAll("[class*='animate-live']")];

	expect(pulsing).not.toHaveLength(expectedPulsingCount);
	for (const glyph of pulsing) {
		expect(glyph).toHaveClass("motion-reduce:animate-none");
	}
}

async function drawsTheRunningStageSPulsingGlyphInItsStatusLineSColourAsTheDesignDoes(): Promise<void> {
	renderGraph([BUILD_NO_RECORD_STAGE]);

	const build = await graphNode("build");
	const glyph = build.querySelector("[class*='animate-live']");

	expect(glyph).not.toBeNull();
	expect(glyph).not.toHaveClass("text-accent-foreground");
}

async function drawsNoHoverFillOnANodeAsTheDesignSNodeKeepsItsOwnBackground(): Promise<void> {
	renderGraph([
		BUILD_NO_RECORD_STAGE,
		new RunRecordStageBuilder({ stage: "review" }).build(),
	]);

	const [button] = within(await graphNode("review")).getAllByRole("button");

	expect(button?.className).not.toContain("hover:");
}

async function showsAGradedStageSLetter(): Promise<void> {
	renderGraph([PLAN_GRADED_STAGE, BUILD_NO_RECORD_STAGE]);

	expect(await graphNode("plan")).toHaveTextContent("B+");
}

async function readsAStageWhoseLetterFallsShortOfTheRunSMinimumAsStoppedWhateverItsJudgeSVerdict(): Promise<void> {
	renderGraph([
		new RunRecordStageBuilder({
			grade: {
				letter: "B",
				reachesMinimum: false,
				state: "available",
				verdict: "CONTINUE",
			},
			stage: "plan",
			status: "graded",
		}).build(),
		BUILD_NO_RECORD_STAGE,
	]);

	expect(await graphNode("plan")).toHaveTextContent("stopped");
}

async function readsAStageWaitingOnItsJudgeAsAwaitingJudgment(): Promise<void> {
	renderGraph([
		new RunRecordStageBuilder({
			stage: "plan",
			status: "awaiting-judgment",
		}).build(),
		BUILD_NO_RECORD_STAGE,
	]);

	expect(await graphNode("plan")).toHaveTextContent("awaiting judgment");
}

async function keepsGraphNodesAsStepSelectorsWhileARunIsActive(): Promise<void> {
	const expectedButtonCount = 1;

	renderGraph([
		new RunRecordStageBuilder({
			checkpoint: "recorded",
			stage: "plan",
			status: "graded",
		}).build(),
		BUILD_NO_RECORD_STAGE,
	]);

	expect(within(await graphNode("build")).getAllByRole("button")).toHaveLength(
		expectedButtonCount,
	);
	await selectStage("plan");
	expect(screen.queryByRole("button", { name: /Replay step/u })).toBeNull();
}
