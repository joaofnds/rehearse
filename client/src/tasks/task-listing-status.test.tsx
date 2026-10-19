import { afterEach, describe, expect, it } from "bun:test";

import { screen } from "@testing-library/react";

import { renderAppAt, stubFetchFailing } from "#client/test-support/render-app";

import {
	OLDER_RUN,
	TASK_TITLE,
	declaredTask,
	originalFetch,
	renderTasksAt,
} from "./task-page-fixtures";
import TasksPage from "./tasks-page";

afterEach(() => {
	globalThis.fetch = originalFetch;
});
describe(TasksPage.name, () => {
	describe("when the tasks cannot be read", () => {
		it("says so", saysSo);
	});

	it(
		"explains how to add the first workflow after an empty successful read",
		explainsHowToAddTheFirstWorkflowAfterAnEmptySuccessfulRead,
	);

	it(
		"keeps unreadable workflows distinct from an empty collection",
		keepsUnreadableWorkflowsDistinctFromAnEmptyCollection,
	);

	it(
		"explains a missing case workflow without claiming the whole collection is empty",
		explainsAMissingCaseWorkflowWithoutClaimingTheWholeCollectionIsEmpty,
	);

	describe("when a record cannot be read", () => {
		it(
			"names it beside the tasks it could read",
			namesItBesideTheTasksItCouldRead,
		);
	});
});

async function saysSo(): Promise<void> {
	stubFetchFailing("/api/pipelines");
	renderAppAt("/tasks");

	expect(await screen.findByRole("alert")).toHaveTextContent(
		"Could not load the workflows.",
	);
	expect(
		screen.queryByRole("heading", { name: "No workflows yet" }),
	).toBeNull();
}

async function explainsHowToAddTheFirstWorkflowAfterAnEmptySuccessfulRead(): Promise<void> {
	renderTasksAt("/cases?view=workflows", []);

	expect(
		await screen.findByRole("heading", { name: "No workflows yet" }),
	).toBeVisible();
	expect(screen.getByRole("link", { name: "Browse cases" })).toHaveAttribute(
		"href",
		"/cases",
	);
}

async function keepsUnreadableWorkflowsDistinctFromAnEmptyCollection(): Promise<void> {
	renderTasksAt("/tasks", [], [{ id: OLDER_RUN, reason: "JSON Parse error" }]);

	expect(await screen.findByRole("alert")).toHaveTextContent(
		"JSON Parse error",
	);
	expect(
		screen.queryByRole("heading", { name: "No workflows yet" }),
	).toBeNull();
}

async function explainsAMissingCaseWorkflowWithoutClaimingTheWholeCollectionIsEmpty(): Promise<void> {
	renderTasksAt("/cases?view=workflows&caseId=missing", [declaredTask()]);

	expect(
		await screen.findByText(
			"No workflow definition is recorded for this case.",
		),
	).toBeVisible();
	expect(
		screen.queryByRole("heading", { name: "No workflows yet" }),
	).toBeNull();
}

async function namesItBesideTheTasksItCouldRead(): Promise<void> {
	renderTasksAt(
		"/tasks",
		[declaredTask()],
		[{ id: OLDER_RUN, reason: "JSON Parse error" }],
	);

	const notice = await screen.findByText(`${OLDER_RUN}: JSON Parse error`);

	expect(notice).toBeInTheDocument();
	expect(screen.getByRole("article", { name: TASK_TITLE })).toBeInTheDocument();
}
