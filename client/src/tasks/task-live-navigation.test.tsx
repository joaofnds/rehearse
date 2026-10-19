import { afterEach, describe, expect, it } from "bun:test";

import { screen, within } from "@testing-library/react";

import {
	NEWER_RUN,
	OLDER_RUN,
	OTHER_TASK_RUN,
	TASK_TITLE,
	originalFetch,
	renderTasksBeforeTheirRunWasRecorded,
	renderTasksWhileRunning,
} from "./task-page-fixtures";
import TasksPage from "./tasks-page";

afterEach(() => {
	globalThis.fetch = originalFetch;
});
describe(TasksPage.name, () => {
	it(
		"opens the live monitor on the newest of its runs in flight",
		opensTheLiveMonitorOnTheNewestOfItsRunsInFlight,
	);

	it(
		"opens a run started after the page read its tasks once the run is recorded",
		opensARunStartedAfterThePageReadItsTasksOnceTheRunIsRecorded,
	);
});

async function opensTheLiveMonitorOnTheNewestOfItsRunsInFlight(): Promise<void> {
	renderTasksWhileRunning([OLDER_RUN, NEWER_RUN, OTHER_TASK_RUN]);

	const card = await screen.findByRole("article", { name: TASK_TITLE });

	expect(
		await within(card).findByRole("link", { name: "Open graph" }),
	).toHaveAttribute("href", `/monitor/${NEWER_RUN}`);
}

async function opensARunStartedAfterThePageReadItsTasksOnceTheRunIsRecorded(): Promise<void> {
	renderTasksBeforeTheirRunWasRecorded(NEWER_RUN);

	const card = await screen.findByRole("article", { name: TASK_TITLE });

	expect(
		await within(card).findByRole("link", { name: "Open graph" }),
	).toHaveAttribute("href", `/monitor/${NEWER_RUN}`);
}
