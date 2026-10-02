import { afterEach, describe, expect, it } from "bun:test";
import { fireEvent, screen, within } from "@testing-library/react";
import type { PipelinesResponse } from "./pipelines-query";
import { TasksPage } from "./tasks-page";
import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import { renderAppWithStub } from "#client/test-support/render-app";
import { runRow } from "#client/test-support/runs-in-flight";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

const TASK_PATH = "cases/audit-log/pipelines/default.json";
const OLDER_RUN = "2026-09-28T10-03-07.498Z";
const NEWER_RUN = "2026-10-01T22-07-54.847Z";
const OTHER_TASK_RUN = "2026-10-02T09-00-00.000Z";
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

function overrideTask(): ListedPipeline {
	return {
		path: "cases/audit-log/pipelines/build-only.json",
		stages: ["build"],
		stageJudges: 1,
		taskJudges: 0,
		declaredBy: null,
		cases: ["audit-log"],
		runs: [NEWER_RUN],
		figures: { counted: 1, corpusVersion: null, leftOut: 0 },
	};
}

function renderTasksAt(
	path: string,
	pipelines: readonly ListedPipeline[],
	unreadable: PipelinesResponse["unreadable"] = [],
): void {
	const response: PipelinesResponse = {
		pipelines: [...pipelines],
		unreadable,
	};
	renderAppWithStub(path, new Map([["/api/pipelines", response]]));
}

function renderTasksWhileRunning(inFlight: readonly string[]): void {
	const history: RunHistoryResponse = {
		rows: inFlight.map((run) => runRow({ run })),
		launches: [],
		unreadable: [],
	};
	const response: PipelinesResponse = {
		pipelines: [declaredTask()],
		unreadable: [],
	};
	renderAppWithStub(
		"/tasks",
		new Map<string, unknown>([
			["/api/pipelines", response],
			["/api/runs", history],
		]),
	);
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

	it("shows a task's id, target, figures, description and steps on its card", async () => {
		renderTasksAt("/tasks", [declaredTask()]);

		const card = await screen.findByRole("article", { name: TASK_PATH });

		expect(
			within(card).getByText("../../../nest/template"),
		).toBeInTheDocument();
		expect(
			within(card).getByText(
				"14 runs at corpus@e73e56 · 1 case · 2 step judges + 1 task judge",
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
	});

	it("draws Edit steps on each card but says it is not wired yet", async () => {
		renderTasksAt("/tasks", [declaredTask()]);

		const card = await screen.findByRole("article", { name: TASK_PATH });
		const edit = within(card).getByRole("button", { name: "Edit steps" });

		expect(edit).toHaveAttribute("aria-disabled", "true");
		expect(edit).toHaveAccessibleDescription("Not wired in v0.6");
	});

	it("opens the live monitor on the newest of its runs in flight", async () => {
		renderTasksWhileRunning([OLDER_RUN, NEWER_RUN, OTHER_TASK_RUN]);

		const card = await screen.findByRole("article", { name: TASK_PATH });

		expect(
			await within(card).findByRole("link", { name: "Open graph" }),
		).toHaveAttribute("href", `/monitor/${NEWER_RUN}`);
	});

	describe("when none of its runs is in flight", () => {
		it("draws Open graph disabled and says why", async () => {
			renderTasksWhileRunning([OTHER_TASK_RUN]);

			const card = await screen.findByRole("article", { name: TASK_PATH });
			const open = within(card).getByRole("button", { name: "Open graph" });

			expect(open).toHaveAttribute("aria-disabled", "true");
			expect(open).toHaveAccessibleDescription(
				"None of this task's runs is in flight",
			);
		});
	});

	describe("when only a run's override chose the task", () => {
		it("says no case declares it and that its runs recorded no corpus version", async () => {
			const task = overrideTask();
			renderTasksAt("/tasks", [task]);

			const card = await screen.findByRole("article", { name: task.path });

			expect(
				within(card).getByText("No case declares it as its default"),
			).toBeInTheDocument();
			expect(
				within(card).getByText(
					"1 run, corpus version not recorded · 1 case · 1 step judge + no task judge",
				),
			).toBeInTheDocument();
			expect(
				within(card).getByText(
					"A run chose this pipeline over its case's default, so no case's final rubric judges it as a task.",
				),
			).toBeInTheDocument();
		});
	});

	describe("when no run has recorded the task", () => {
		it("says it has no runs yet", async () => {
			renderTasksAt("/tasks", [
				{
					...declaredTask(),
					runs: [],
					figures: { counted: 0, corpusVersion: null, leftOut: 0 },
				},
			]);

			const card = await screen.findByRole("article", { name: TASK_PATH });

			expect(
				within(card).getByText(
					"No runs yet · 1 case · 2 step judges + 1 task judge",
				),
			).toBeInTheDocument();
		});
	});

	describe("when a record cannot be read", () => {
		it("names it beside the tasks it could read", async () => {
			renderTasksAt(
				"/tasks",
				[declaredTask()],
				[{ id: OLDER_RUN, reason: "JSON Parse error" }],
			);

			const notice = await screen.findByText(`${OLDER_RUN}: JSON Parse error`);

			expect(notice).toBeInTheDocument();
			expect(
				screen.getByRole("article", { name: TASK_PATH }),
			).toBeInTheDocument();
		});
	});
});
