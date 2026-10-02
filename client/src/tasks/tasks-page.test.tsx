import { afterEach, describe, expect, it } from "bun:test";
import { fireEvent, screen } from "@testing-library/react";
import type { PipelinesResponse } from "./pipelines-query";
import { TasksPage } from "./tasks-page";
import { renderAppWithStub } from "#client/test-support/render-app";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

const TASK_PATH = "cases/audit-log/pipelines/default.json";
const OLDER_RUN = "2026-09-28T10-03-07.498Z";
const NEWER_RUN = "2026-10-01T22-07-54.847Z";
const DIGEST =
	"e73e56621fca244376a085a27f68834c9e15038e7f53966ff1aff9b199891922";

type ListedPipeline = PipelinesResponse["pipelines"][number];

function declaredTask(): ListedPipeline {
	return {
		path: TASK_PATH,
		stages: ["shape", "build"],
		stageJudges: 2,
		taskJudges: 1,
		declaredBy: {
			id: "audit-log",
			title: "Asynchronous audit log module against the NestJS template",
			target: "../../../nest/template",
		},
		cases: ["audit-log"],
		runs: [NEWER_RUN, OLDER_RUN],
		figures: { counted: 14, corpusVersion: DIGEST, leftOut: 12 },
	};
}

function renderTasksAt(
	path: string,
	pipelines: readonly ListedPipeline[],
): void {
	const response: PipelinesResponse = {
		pipelines: [...pipelines],
		unreadable: [],
	};
	renderAppWithStub(path, new Map([["/api/pipelines", response]]));
}

describe(TasksPage.name, () => {
	it("opens from the Tasks nav item under its header", async () => {
		renderTasksAt("/", [declaredTask()]);

		fireEvent.click(await screen.findByRole("link", { name: /^Tasks/u }));

		expect(
			await screen.findByRole("heading", { level: 1, name: "Tasks" }),
		).toBeInTheDocument();
		expect(
			screen.getByText(/declared as the pipeline file a case names/u),
		).toBeInTheDocument();
	});

	it.each(["Import a task", "Export with judges"])(
		"draws %s but says it is not wired yet",
		async (name) => {
			renderTasksAt("/tasks", [declaredTask()]);

			const control = await screen.findByRole("button", { name });

			expect(control).toHaveAttribute("aria-disabled", "true");
			expect(control).toHaveAccessibleDescription("Not wired in v0.6");
		},
	);
});
