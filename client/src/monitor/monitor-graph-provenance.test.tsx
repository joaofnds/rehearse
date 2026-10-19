import { afterEach, describe, expect, it, setSystemTime } from "bun:test";

import { fireEvent, screen, within } from "@testing-library/react";

import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";
import { RunRecordStageBuilder } from "#client/test-support/run-detail";

import {
	CONTRIBUTION_ANALYSES,
	PRODUCED_NOTE,
	renderGraph,
} from "./monitor-graph-test-fixtures";
import { graphNode, originalFetch, selectStage } from "./monitor-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
	setSystemTime();
});

describe("/monitor task graph", () => {
	it(
		"shows the newest analysis's phrase toward the task grade on a step that ran, over what it produced",
		showsTheNewestAnalysisSPhraseTowardTheTaskGradeOnAStepThatRanOverWhatItProduced,
	);

	it(
		"shows a checkpoint recorded before short ids as recorded",
		showsACheckpointRecordedBeforeShortIdsAsRecorded,
	);

	it(
		"opens a selected stage's recorded artifact in Inputs & output",
		opensASelectedStageSRecordedArtifactInInputsOutput,
	);

	it("numbers each step in two digits", numbersEachStepInTwoDigits);

	it(
		"names the task and its step count, and what a step below the minimum grade does",
		namesTheTaskAndItsStepCountAndWhatAStepBelowTheMinimumGradeDoes,
	);

	it(
		"says what a step shows when the record holds no minimum grade",
		saysWhatAStepShowsWhenTheRecordHoldsNoMinimumGrade,
	);

	it(
		"says a step shows what its record says it produced until an analysis gives one agent's reading of its contribution",
		saysAStepShowsWhatItsRecordSaysItProducedUntilAnAnalysisGivesOneAgentSReadingOfItsContribution,
	);
});

async function showsTheNewestAnalysisSPhraseTowardTheTaskGradeOnAStepThatRanOverWhatItProduced(): Promise<void> {
	renderGraph(
		[
			new RunRecordStageBuilder({
				artifactsOut: {
					...new RunRecordStageBuilder({ stage: "plan" }).build().artifactsOut,
					changedPaths: {
						paths: [],
						state: "available",
					},
					commitSubjects: {
						state: "available",
						subjects: [],
					},
				},
				checkpoint: "recorded",
				stage: "plan",
				status: "graded",
			}).build(),
			new RunRecordStageBuilder().build(),
		],
		{
			analyses: CONTRIBUTION_ANALYSES,
			runUnder: undefined,
		},
	);

	const plan = await graphNode("plan");

	expect(
		await within(plan).findByText("left the scope the judge read open"),
	).toBeInTheDocument();
	expect(plan).not.toHaveTextContent("produced");
}

async function showsACheckpointRecordedBeforeShortIdsAsRecorded(): Promise<void> {
	renderGraph([
		new RunRecordStageBuilder({
			checkpoint: "recorded",
			stage: "plan",
			status: "graded",
		}).build(),
		new RunRecordStageBuilder().build(),
	]);

	expect(await graphNode("plan")).toHaveTextContent("◆checkpoint recorded");
}

async function opensASelectedStageSRecordedArtifactInInputsOutput(): Promise<void> {
	renderGraph([
		new RunRecordStageBuilder({
			artifactsOut: {
				...new RunRecordStageBuilder({ stage: "plan" }).build().artifactsOut,
				declared: {
					paths: ["docs/plan.md"],
					state: "available",
				},
			},
			instructionFiles: {
				files: ["a.md", "b.md", "c.md"].map((path) => ({
					path,
					sha256: "0".repeat(SHA256_HEX_CHARACTERS),
				})),
				state: "available",
			},
			stage: "plan",
			status: "graded",
		}).build(),
		new RunRecordStageBuilder().build(),
	]);

	await selectStage("plan");
	fireEvent.click(screen.getByRole("button", { name: "Inputs & output" }));

	expect(
		await within(
			await screen.findByRole("dialog", { name: /plan/u }),
		).findByText("docs/plan.md"),
	).toBeInTheDocument();
}

async function numbersEachStepInTwoDigits(): Promise<void> {
	renderGraph([new RunRecordStageBuilder().build()]);

	expect(await graphNode("build")).toHaveTextContent(/^01build/u);
}

async function namesTheTaskAndItsStepCountAndWhatAStepBelowTheMinimumGradeDoes(): Promise<void> {
	renderGraph([
		new RunRecordStageBuilder({ stage: "plan" }).build(),
		new RunRecordStageBuilder().build(),
	]);

	const graph = await screen.findByRole("region", { name: "Task graph" });

	expect(within(graph).getByRole("heading", { level: 2 })).toHaveTextContent(
		"Workflow · audit-log · 2 steps, in order",
	);
	expect(graph).toHaveTextContent(
		"Minimum grade for every step in this task is B-. A step below it stops the run.",
	);
}

async function saysWhatAStepShowsWhenTheRecordHoldsNoMinimumGrade(): Promise<void> {
	renderGraph(
		[
			new RunRecordStageBuilder({ stage: "plan" }).build(),
			new RunRecordStageBuilder().build(),
		],
		{
			analyses: undefined,
			minimumGrade: { reasons: ["no stage graded"], state: "unavailable" },
			runUnder: undefined,
		},
	);

	const graph = await screen.findByRole("region", { name: "Task graph" });

	expect(graph).toHaveTextContent(PRODUCED_NOTE);
}

async function saysAStepShowsWhatItsRecordSaysItProducedUntilAnAnalysisGivesOneAgentSReadingOfItsContribution(): Promise<void> {
	renderGraph([
		new RunRecordStageBuilder({ stage: "plan" }).build(),
		new RunRecordStageBuilder().build(),
	]);

	const graph = await screen.findByRole("region", { name: "Task graph" });

	expect(graph).toHaveTextContent(PRODUCED_NOTE);
}
