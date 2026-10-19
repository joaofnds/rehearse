import { afterEach, describe, expect, it, setSystemTime } from "bun:test";

import { RunRecordStageBuilder } from "#client/test-support/run-detail";

import { DIGEST, renderGraph } from "./monitor-graph-test-fixtures";
import { graphNode, originalFetch } from "./monitor-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
	setSystemTime();
});

describe("/monitor task graph", () => {
	it(
		"shows a finished stage's cost, duration, fired blockers, corpus version and checkpoint",
		showsAFinishedStageSCostDurationFiredBlockersCorpusVersionAndCheckpoint,
	);

	it(
		"says nothing of what a finished stage produced when its record counts nothing and no analysis reads it",
		saysNothingOfWhatAFinishedStageProducedWhenItsRecordCountsNothingAndNoAnalysisReadsIt,
	);

	it(
		"names a stage's checkpoint within its case, since the task heading names the case",
		namesAStageSCheckpointWithinItsCaseSinceTheTaskHeadingNamesTheCase,
	);

	it(
		"shows a dash for the corpus version of a stage not started",
		showsADashForTheCorpusVersionOfAStageNotStarted,
	);

	it(
		"shows what a finished stage produced, from its record, until an analysis exists",
		showsWhatAFinishedStageProducedFromItsRecordUntilAnAnalysisExists,
	);

	it(
		"shows the workflow-state changes a finished planning stage produced",
		showsTheWorkflowStateChangesAFinishedPlanningStageProduced,
	);

	it(
		"shows the files a finished stage changed when its record holds no commit subjects",
		showsTheFilesAFinishedStageChangedWhenItsRecordHoldsNoCommitSubjects,
	);
});

async function showsAFinishedStageSCostDurationFiredBlockersCorpusVersionAndCheckpoint(): Promise<void> {
	renderGraph([
		new RunRecordStageBuilder({
			blockers: {
				fired: 2,
				firedIds: ["scope-declared", "tests-pass"],
				state: "available",
				total: 4,
			},
			checkpoint: "recorded",
			checkpointShortId: {
				shortId: "ckpt-0148-s1",
				state: "available",
			},
			corpusVersion: {
				digest: DIGEST,
				kind: "version",
			},
			judgeCost: {
				state: "available",
				usd: 0.22,
			},
			sessionCost: {
				state: "available",
				usd: 0.9,
			},
			stage: "plan",
			status: "graded",
			wallTime: {
				ms: 242e3,
				state: "available",
			},
		}).build(),
		new RunRecordStageBuilder().build(),
	]);

	const shown = await graphNode("plan");

	expect(shown).toHaveTextContent("$1.12");
	expect(shown).toHaveTextContent("4m02s");
	expect(shown).toHaveTextContent("2 of 4 fired");
	expect(shown).toHaveTextContent("a41c7e");
	expect(shown).toHaveTextContent("◆ckpt-0148-s1");
}

async function saysNothingOfWhatAFinishedStageProducedWhenItsRecordCountsNothingAndNoAnalysisReadsIt(): Promise<void> {
	renderGraph([
		new RunRecordStageBuilder({
			stage: "plan",
			status: "graded",
		}).build(),
		new RunRecordStageBuilder().build(),
	]);

	const shown = await graphNode("plan");

	expect(shown).not.toHaveTextContent("produced");
	expect(shown).not.toHaveTextContent("contribution pending");
}

async function namesAStageSCheckpointWithinItsCaseSinceTheTaskHeadingNamesTheCase(): Promise<void> {
	renderGraph([
		new RunRecordStageBuilder({
			checkpoint: "recorded",
			checkpointShortId: {
				shortId: "audit-log/r33/s1",
				state: "available",
			},
			stage: "plan",
			status: "graded",
		}).build(),
		new RunRecordStageBuilder().build(),
	]);

	const shown = await graphNode("plan");

	expect(shown).toHaveTextContent("◆r33/s1");
	expect(shown).not.toHaveTextContent("audit-log/r33/s1");
}

async function showsADashForTheCorpusVersionOfAStageNotStarted(): Promise<void> {
	renderGraph([
		new RunRecordStageBuilder().build(),
		new RunRecordStageBuilder({ stage: "review" }).build(),
	]);

	const shown = await graphNode("review");

	expect(shown).toHaveTextContent("— corpus version not recorded");
}

async function showsWhatAFinishedStageProducedFromItsRecordUntilAnAnalysisExists(): Promise<void> {
	renderGraph([
		new RunRecordStageBuilder({
			artifactsOut: {
				...new RunRecordStageBuilder({ stage: "plan" }).build().artifactsOut,
				changedPaths: {
					paths: ["GLOSSARY.md", "AGENTS.md"],
					state: "available",
				},
				commitSubjects: {
					state: "available",
					subjects: ["docs: add project glossary"],
				},
			},
			stage: "plan",
			status: "graded",
		}).build(),
		new RunRecordStageBuilder().build(),
	]);

	const plan = await graphNode("plan");

	expect(plan).toHaveTextContent("produced 1 commit, 2 files changed");
}

async function showsTheWorkflowStateChangesAFinishedPlanningStageProduced(): Promise<void> {
	renderGraph([
		new RunRecordStageBuilder({
			artifactsOut: {
				...new RunRecordStageBuilder({ stage: "plan" }).build().artifactsOut,
				workflowState: {
					changes: [
						{
							change: "added",
							path: "backlog/drafts/draft-1.md",
						},
						{
							change: "modified",
							path: "backlog/tasks/task-1.md",
						},
					],
					state: "available",
				},
			},
			stage: "plan",
			status: "graded",
		}).build(),
		new RunRecordStageBuilder().build(),
	]);

	expect(await graphNode("plan")).toHaveTextContent(
		"produced 2 workflow-state changes",
	);
}

async function showsTheFilesAFinishedStageChangedWhenItsRecordHoldsNoCommitSubjects(): Promise<void> {
	renderGraph([
		new RunRecordStageBuilder({
			artifactsOut: {
				...new RunRecordStageBuilder({ stage: "plan" }).build().artifactsOut,
				changedPaths: {
					paths: ["src/audit.ts"],
					state: "available",
				},
			},
			stage: "plan",
			status: "graded",
		}).build(),
		new RunRecordStageBuilder().build(),
	]);

	expect(await graphNode("plan")).toHaveTextContent("produced 1 file changed");
}
