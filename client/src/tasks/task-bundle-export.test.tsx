import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, within } from "@testing-library/react";

import {
	declaredTask,
	originalFetch,
	overrideTask,
	renderTasksAt,
} from "./task-page-fixtures";
import TasksPage from "./tasks-page";

afterEach(() => {
	globalThis.fetch = originalFetch;
});
describe(TasksPage.name, () => {
	describe("exporting a task with its judges", () => {
		it(
			"offers each declared task as a file the server writes",
			offersEachDeclaredTaskAsAFileTheServerWrites,
		);

		it(
			"says there is nothing to export when no case declares a task",
			saysThereIsNothingToExportWhenNoCaseDeclaresATask,
		);
	});
});

async function offersEachDeclaredTaskAsAFileTheServerWrites(): Promise<void> {
	renderTasksAt("/tasks", [declaredTask(), overrideTask()]);

	fireEvent.click(
		await screen.findByRole("button", { name: "Export with judges" }),
	);
	const dialog = await screen.findByRole("dialog", {
		name: "Export with judges",
	});

	expect(
		within(dialog)
			.getAllByRole("link")
			.map((link) => link.textContent),
	).toEqual(["Download"]);
	expect(
		within(dialog).getByRole("link", {
			name: "Download audit-log.task.json",
		}),
	).toHaveAttribute("href", "/api/cases/audit-log/bundle");
	expect(within(dialog).getByText("audit-log.task.json")).toBeVisible();
	expect(
		within(dialog).getByRole("link", {
			name: "Download audit-log.task.json",
		}),
	).toHaveAttribute("download", "audit-log.task.json");
}

async function saysThereIsNothingToExportWhenNoCaseDeclaresATask(): Promise<void> {
	renderTasksAt("/tasks", [overrideTask()]);

	fireEvent.click(
		await screen.findByRole("button", { name: "Export with judges" }),
	);

	expect(
		await screen.findByText(
			"No workflow is declared by a case, so there is nothing to export.",
		),
	).toBeInTheDocument();
}
