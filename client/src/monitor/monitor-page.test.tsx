import { afterEach, describe, expect, it, setSystemTime } from "bun:test";

import { fireEvent, screen, within } from "@testing-library/react";

import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import ListedStageGradeBuilder from "#client/test-support/listed-stage-grade-test-builder";
import {
	RunRecordBuilder,
	RunRecordStageBuilder,
} from "#client/test-support/run-detail";

import {
	RUN,
	header,
	originalFetch,
	renderMonitor,
} from "./monitor-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
	setSystemTime();
});

describe("/monitor", () => {
	it(
		"lists the run's stages in pipeline order with the running one marked",
		listsTheRunSStagesInPipelineOrderWithTheRunningOneMarked,
	);

	describe("the identity header", () => {
		it(
			"names the run within its case, since the case is named beside it",
			namesTheRunWithinItsCaseSinceTheCaseIsNamedBesideIt,
		);

		it(
			"names the run, case and corpus in the compact header",
			namesTheRunCaseAndCorpusWhileKeepingExactTargetAndModelInSetupProvenance,
		);

		it(
			"links back to the Runs list from the run workspace",
			linksBackToTheRunsListFromTheRunWorkspace,
		);

		it(
			"offers Stop & restore repo for a run the browser launched",
			offersStopRestoreRepoForARunTheBrowserLaunched,
		);

		it(
			"stops a run started outside the browser through the run itself",
			stopsARunStartedOutsideTheBrowserThroughTheRunItself,
		);

		it(
			"asks the run to pause after the step in flight",
			asksTheRunToPauseAfterTheStepInFlight,
		);

		it(
			"acknowledges the pause with the paused glyph at the design's meta size",
			acknowledgesThePauseWithThePausedGlyphAtTheDesignSMetaSize,
		);

		it(
			"acknowledges the stop with the stopped glyph at the design's meta size",
			acknowledgesTheStopWithTheStoppedGlyphAtTheDesignSMetaSize,
		);
	});
});

async function listsTheRunSStagesInPipelineOrderWithTheRunningOneMarked(): Promise<void> {
	const row = new PipelineRunRowBuilder({
		run: RUN,
		stageGrades: {
			grades: [
				new ListedStageGradeBuilder({ stage: "plan" })
					.graded({ letter: "B+" })
					.build(),
				new ListedStageGradeBuilder({ stage: "build" }).build(),
				new ListedStageGradeBuilder({ stage: "review" }).build(),
			],
			state: "available",
		},
	})
		.withExecutionProgress({ stage: "build" })
		.build();
	const record = new RunRecordBuilder({
		run: RUN,
		stages: ["plan", "build", "review"].map((stage) =>
			new RunRecordStageBuilder({ stage }).build(),
		),
	})
		.withStage({ stage: "plan", status: "graded" })
		.build();

	renderMonitor(row, new Map([[`/api/runs/${RUN}`, record]]));

	const graph = await screen.findByRole("region", { name: "Task graph" });
	const nodes = within(graph).getAllByRole("listitem");
	expect(
		nodes.map(
			(node) => within(node).getByText(/^(?:plan|build|review)$/u).textContent,
		),
	).toEqual(["plan", "build", "review"]);
	expect(
		nodes.map(
			(node) => within(node).getByText(/Continued|running|queued/u).textContent,
		),
	).toEqual([
		"✓Continued · minimum unavailable",
		"●session running",
		"○queued",
	]);
}

async function namesTheRunWithinItsCaseSinceTheCaseIsNamedBesideIt(): Promise<void> {
	renderMonitor(
		new PipelineRunRowBuilder({ run: RUN, shortId: "audit-log/r33" })
			.withExecutionProgress()
			.build(),
	);

	const shown = await header();

	expect(within(shown).getByRole("heading", { level: 1 })).toHaveTextContent(
		/^r33$/u,
	);
	expect(
		within(shown).getByRole("link", { name: "audit-log" }),
	).toHaveAttribute("href", "/cases?caseId=audit-log");
	expect(shown).toHaveTextContent("running step 2");
}

async function namesTheRunCaseAndCorpusWhileKeepingExactTargetAndModelInSetupProvenance(): Promise<void> {
	renderMonitor(
		new PipelineRunRowBuilder({
			corpusVersion: { digest: "a41c7e99", kind: "version" },
			run: RUN,
		})
			.withExecutionProgress()
			.build(),
	);

	const shown = await header();

	expect(within(shown).getByRole("heading", { level: 1 })).toHaveTextContent(
		"r-0148",
	);
	expect(shown).toHaveTextContent("running step 2");
	expect(shown).toHaveTextContent("audit-log");
	expect(shown).toHaveTextContent("corpus@a41c7e");
	expect(shown).not.toHaveTextContent("acme-api @ e91f2a");
	expect(shown).not.toHaveTextContent("claude-opus-4 / high");
}

async function linksBackToTheRunsListFromTheRunWorkspace(): Promise<void> {
	renderMonitor(
		new PipelineRunRowBuilder({ run: RUN }).withExecutionProgress().build(),
	);

	expect(
		within(await header()).getByRole("link", { name: /Runs/u }),
	).toHaveAttribute("href", "/");
}

async function offersStopRestoreRepoForARunTheBrowserLaunched(): Promise<void> {
	renderMonitor(
		new PipelineRunRowBuilder({ launchId: "launch-1", run: RUN })
			.withExecutionProgress()
			.build(),
	);

	expect(
		within(await header()).getByRole("button", {
			name: "Stop & restore repo",
		}),
	).toBeEnabled();
}

async function stopsARunStartedOutsideTheBrowserThroughTheRunItself(): Promise<void> {
	renderMonitor(
		new PipelineRunRowBuilder({ launchId: undefined, run: RUN })
			.withExecutionProgress()
			.build(),
		new Map([[`/api/runs/${RUN}/stop`, {}]]),
	);

	fireEvent.click(
		within(await header()).getByRole("button", {
			name: "Stop & restore repo",
		}),
	);

	expect(
		await within(await header()).findByText("stop requested"),
	).toBeInTheDocument();
}

async function asksTheRunToPauseAfterTheStepInFlight(): Promise<void> {
	renderMonitor(
		new PipelineRunRowBuilder({ run: RUN }).withExecutionProgress().build(),
		new Map([[`/api/runs/${RUN}/pause`, {}]]),
	);

	fireEvent.click(
		within(await header()).getByRole("button", {
			name: "Pause after this step",
		}),
	);

	expect(
		await within(await header()).findByText(
			"pause requested · ends after this step is judged",
		),
	).toBeInTheDocument();
}

async function acknowledgesThePauseWithThePausedGlyphAtTheDesignSMetaSize(): Promise<void> {
	renderMonitor(
		new PipelineRunRowBuilder({ run: RUN }).withExecutionProgress().build(),
		new Map([[`/api/runs/${RUN}/pause`, {}]]),
	);

	fireEvent.click(
		within(await header()).getByRole("button", {
			name: "Pause after this step",
		}),
	);

	const acknowledged = await within(await header()).findByText(
		"pause requested · ends after this step is judged",
	);
	expect(acknowledged).toHaveTextContent(/^‖/u);
	expect(acknowledged).toHaveClass("text-12");
}

async function acknowledgesTheStopWithTheStoppedGlyphAtTheDesignSMetaSize(): Promise<void> {
	renderMonitor(
		new PipelineRunRowBuilder({ launchId: "launch-1", run: RUN })
			.withExecutionProgress()
			.build(),
		new Map([["/api/launches/launch-1/stop", {}]]),
	);

	fireEvent.click(
		within(await header()).getByRole("button", {
			name: "Stop & restore repo",
		}),
	);

	const acknowledged = await within(await header()).findByText(
		"stop requested",
	);
	expect(acknowledged).toHaveTextContent(/^◼/u);
	expect(acknowledged).toHaveClass("text-12");
}

async function readsExactTargetAndModelInSetupProvenance(): Promise<void> {
	renderMonitor(
		new PipelineRunRowBuilder({
			corpusVersion: { digest: "a41c7e99", kind: "version" },
			run: RUN,
		})
			.withExecutionProgress()
			.build(),
	);
	await header();

	fireEvent.click(screen.getByRole("button", { name: "Results" }));

	fireEvent.click(await screen.findByText("Run setup & provenance"));

	const setup = screen.getByRole("region", {
		name: "Run setup & provenance",
	});

	expect(setup).toHaveTextContent("acme-api @ e91f2a");

	expect(setup).toHaveTextContent("claude-opus-4 / high");
}

describe("/monitor setup provenance", () => {
	it(
		"reads exact target and model in setup provenance",
		readsExactTargetAndModelInSetupProvenance,
	);
});
