import { afterEach, describe, expect, it } from "bun:test";

import { screen, within } from "@testing-library/react";

import {
	DIGEST,
	OTHER_TASK_RUN,
	TASK_TITLE,
	declaredTask,
	originalFetch,
	overrideTask,
	renderTasksAt,
	renderTasksWhileRunning,
} from "./task-page-fixtures";
import TasksPage from "./tasks-page";

afterEach(() => {
	globalThis.fetch = originalFetch;
});
describe(TasksPage.name, () => {
	it(
		"keeps the legacy Tasks route usable under its header",
		keepsTheLegacyTasksRouteUsableUnderItsHeader,
	);

	it(
		"shows a task's id, target, figures, description and steps on its card",
		showsATaskSIdTargetFiguresDescriptionAndStepsOnItsCard,
	);

	describe("when none of its runs is in flight", () => {
		it(
			"draws Open graph disabled and says why",
			drawsOpenGraphDisabledAndSaysWhy,
		);
	});

	describe("when only a run's override chose the task", () => {
		it(
			"names the target its cases ran it against and that its runs recorded no corpus version",
			namesTheTargetItsCasesRanItAgainstAndThatItsRunsRecordedNoCorpusVersion,
		);
	});

	describe("when no case that ran it is declared any more", () => {
		it(
			"says no declared case names its target",
			saysNoDeclaredCaseNamesItsTarget,
		);
	});

	describe("when no run has recorded the task", () => {
		it("says it has no runs yet", saysItHasNoRunsYet);
	});

	describe("when only a confirmation group's reps ran the task", () => {
		it("counts the reps as its runs", countsTheRepsAsItsRuns);
	});

	describe("when every run is at the latest corpus version", () => {
		it("says no run was left out", saysNoRunWasLeftOut);
	});
});

async function keepsTheLegacyTasksRouteUsableUnderItsHeader(): Promise<void> {
	renderTasksAt("/tasks", [declaredTask()]);

	expect(
		await screen.findByRole("heading", { level: 1, name: "Workflows" }),
	).toBeInTheDocument();
	expect(
		screen.getByText("Reusable step definitions for workflow cases"),
	).toBeInTheDocument();
}

async function showsATaskSIdTargetFiguresDescriptionAndStepsOnItsCard(): Promise<void> {
	renderTasksAt("/tasks", [declaredTask()]);

	const card = await screen.findByRole("article", { name: TASK_TITLE });

	expect(within(card).getByText("../../../nest/template")).toBeInTheDocument();
	expect(
		within(card).getByText(
			"14 runs at corpus@e73e56 · 1 case · 2 step judges + 1 final judge",
		),
	).toBeInTheDocument();
	expect(
		within(card).getByText(
			"12 runs left out, at another corpus version or none recorded",
		),
	).toBeInTheDocument();
	expect(
		within(card).getByText(
			"Asynchronous audit log module against the NestJS template",
		),
	).toBeInTheDocument();
	expect(within(card).getByText("shape → build")).toBeInTheDocument();
}

async function drawsOpenGraphDisabledAndSaysWhy(): Promise<void> {
	renderTasksWhileRunning([OTHER_TASK_RUN]);

	const card = await screen.findByRole("article", { name: TASK_TITLE });
	const open = within(card).getByRole("button", { name: "Open graph" });

	expect(open).toHaveAttribute("aria-disabled", "true");
	expect(open).toHaveAccessibleDescription(
		"None of this workflow's runs is in flight",
	);
}

async function namesTheTargetItsCasesRanItAgainstAndThatItsRunsRecordedNoCorpusVersion(): Promise<void> {
	const task = overrideTask();
	renderTasksAt("/tasks", [task]);

	const card = await screen.findByRole("article", {
		name: "build workflow",
	});

	expect(within(card).getByText("../../../nest/template")).toBeInTheDocument();
	expect(
		within(card).getByText(
			"1 run, corpus version not recorded · 1 case · 1 step judge + no final judge",
		),
	).toBeInTheDocument();
	expect(
		within(card).getByText(
			"A run chose this workflow over its case's default. No case declares it, so it has no final judge of its own.",
		),
	).toBeInTheDocument();
}

async function saysNoDeclaredCaseNamesItsTarget(): Promise<void> {
	const task = { ...overrideTask(), targets: [] };
	renderTasksAt("/tasks", [task]);

	const card = await screen.findByRole("article", {
		name: "build workflow",
	});

	expect(
		within(card).getByText("No declared case names its target"),
	).toBeInTheDocument();
}

async function saysItHasNoRunsYet(): Promise<void> {
	renderTasksAt("/tasks", [
		{
			...declaredTask(),
			figures: { corpusVersion: null, counted: 0, leftOut: 0 },
			runs: [],
		},
	]);

	const card = await screen.findByRole("article", { name: TASK_TITLE });

	expect(
		within(card).getByText(
			"No runs yet · 1 case · 2 step judges + 1 final judge",
		),
	).toBeInTheDocument();
}

async function countsTheRepsAsItsRuns(): Promise<void> {
	renderTasksAt("/tasks", [
		{
			...declaredTask(),
			figures: { corpusVersion: DIGEST, counted: 3, leftOut: 0 },
			runs: [],
		},
	]);

	const card = await screen.findByRole("article", { name: TASK_TITLE });

	expect(
		within(card).getByText(
			"3 runs at corpus@e73e56 · 1 case · 2 step judges + 1 final judge",
		),
	).toBeInTheDocument();
}

async function saysNoRunWasLeftOut(): Promise<void> {
	renderTasksAt("/tasks", [
		{
			...declaredTask(),
			figures: { corpusVersion: DIGEST, counted: 2, leftOut: 0 },
		},
	]);

	const card = await screen.findByRole("article", { name: TASK_TITLE });

	expect(within(card).queryByText(/left out/u)).not.toBeInTheDocument();
}
