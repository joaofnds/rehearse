import { afterEach, describe, expect, it } from "bun:test";
import { z } from "zod";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { PipelinesResponse } from "./pipelines-query";
import { TasksPage } from "./tasks-page";
import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import { FakeServer, stubFetchByPath } from "#client/test-support/fetch-stub";
import type { Reply, SentRequest } from "#client/test-support/fetch-stub";
import {
	renderAppAt,
	renderAppWithStub,
	SHELL_BASELINE,
	stubFetchFailing,
} from "#client/test-support/render-app";
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
		targets: ["../../../nest/template"],
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
		targets: ["../../../nest/template"],
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
			["/api/run-listing", history],
		]),
	);
}

/**
 * Serves the tasks as they read before a run started, then as they read once
 * its manifest names its pipeline, with that run in flight throughout.
 */
function renderTasksBeforeTheirRunWasRecorded(run: string): void {
	stubFetchByPath(SHELL_BASELINE);
	const answerBaseline = globalThis.fetch;
	const before: PipelinesResponse = {
		pipelines: [{ ...declaredTask(), runs: [OLDER_RUN] }],
		unreadable: [],
	};
	const after: PipelinesResponse = {
		pipelines: [{ ...declaredTask(), runs: [run, OLDER_RUN] }],
		unreadable: [],
	};
	const history: RunHistoryResponse = {
		rows: [runRow({ run })],
		launches: [],
		unreadable: [],
	};
	let pipelineReads = 0;
	const stub = (request: string | URL | Request): Promise<Response> => {
		const { pathname } = new URL(
			request instanceof Request ? request.url : request,
			"http://localhost",
		);
		if (pathname === "/api/pipelines") {
			pipelineReads += 1;

			return Promise.resolve(
				Response.json(pipelineReads === 1 ? before : after),
			);
		}

		if (pathname === "/api/run-listing") {
			return Promise.resolve(Response.json(history));
		}

		return answerBaseline(request);
	};
	stub.preconnect = answerBaseline.preconnect;
	globalThis.fetch = stub;
	renderAppAt("/tasks");
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

	describe("exporting a task with its judges", () => {
		it("offers each declared task as a file the server writes", async () => {
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
			).toEqual(["Download audit-log.task.json"]);
			expect(
				within(dialog).getByRole("link", {
					name: "Download audit-log.task.json",
				}),
			).toHaveAttribute("href", "/api/cases/audit-log/bundle");
		});

		it("says there is nothing to export when no case declares a task", async () => {
			renderTasksAt("/tasks", [overrideTask()]);

			fireEvent.click(
				await screen.findByRole("button", { name: "Export with judges" }),
			);

			expect(
				await screen.findByText(
					"No task is declared by a case, so there is nothing to export.",
				),
			).toBeInTheDocument();
		});
	});

	describe("importing a task", () => {
		const BUNDLE = { format: "rehearse-task-bundle", version: 1 };
		const PREVIEW = {
			caseId: "audit-log",
			title: "Asynchronous audit log module",
			targetPath: "../../../nest/template",
			model: "sonnet",
			steps: [{ name: "build", kind: "delivery", skill: "build" }],
			commands: ["bun install", "bun test"],
			services: [
				{
					name: "postgres",
					image: "postgres:18-alpine",
					exports: ["DATABASE_URL", "PGHOST"],
				},
			],
			stepJudges: 1,
		};
		const IMPORTED = { caseId: "audit-log-copy", path: "cases/audit-log-copy" };
		const IMPORT_ACCEPTED: Reply = { status: 201, body: IMPORTED };

		function serving(imported: Reply = IMPORT_ACCEPTED): FakeServer {
			const response: PipelinesResponse = {
				pipelines: [declaredTask()],
				unreadable: [],
			};
			const server = new FakeServer(
				new Map<string, Reply>([
					...[...SHELL_BASELINE].map(([path, body]): [string, Reply] => [
						`GET ${path}`,
						{ status: 200, body },
					]),
					["GET /api/pipelines", { status: 200, body: response }],
					["POST /api/task-bundles/preview", { status: 200, body: PREVIEW }],
					["POST /api/cases/import", imported],
				]),
			);
			server.install();
			renderAppAt("/tasks");

			return server;
		}

		async function chooseBundle(text: string): Promise<HTMLElement> {
			fireEvent.click(
				await screen.findByRole("button", { name: "Import a task" }),
			);
			const dialog = await screen.findByRole("dialog", {
				name: "Import a task",
			});
			fireEvent.change(within(dialog).getByLabelText("Task bundle"), {
				target: {
					files: [new File([text], "audit-log.task.json")],
				},
			});

			return dialog;
		}

		const importBodySchema = z.object({
			id: z.string(),
			title: z.string(),
			targetPath: z.string(),
			bundle: z.unknown(),
		});

		it("shows what the bundle holds and fills the case from it", async () => {
			const server = serving();

			const dialog = await chooseBundle(JSON.stringify(BUNDLE));
			const summary = await within(dialog).findByRole("region", {
				name: "What the bundle holds",
			});

			expect(summary).toHaveTextContent("bun install");
			expect(summary).toHaveTextContent("bun test");
			expect(within(dialog).getByLabelText("Id")).toHaveValue("audit-log");
			expect(within(dialog).getByLabelText("Target repository")).toHaveValue(
				"../../../nest/template",
			);
			expect(
				JSON.parse(server.posted("/api/task-bundles/preview")[0]?.body ?? ""),
			).toEqual({ bundle: BUNDLE });
		});

		it("names each container the bundle starts and the variables it sets", async () => {
			serving();

			const dialog = await chooseBundle(JSON.stringify(BUNDLE));
			const summary = await within(dialog).findByRole("region", {
				name: "What the bundle holds",
			});

			expect(summary).toHaveTextContent(
				"postgres from postgres:18-alpine, setting DATABASE_URL, PGHOST",
			);
		});

		it("imports the bundle under the id typed and says the case is uncommitted", async () => {
			const server = serving();

			const dialog = await chooseBundle(JSON.stringify(BUNDLE));
			const id = await within(dialog).findByLabelText("Id");
			fireEvent.change(id, { target: { value: "audit-log-copy" } });
			fireEvent.click(within(dialog).getByRole("button", { name: "Import" }));

			expect(
				await screen.findByText(
					"Imported cases/audit-log-copy. It is uncommitted: review and commit it to keep the case.",
				),
			).toBeInTheDocument();
			expect(screen.queryByRole("dialog")).toBeNull();
			expect(
				importBodySchema.parse(
					JSON.parse(server.posted("/api/cases/import")[0]?.body ?? ""),
				),
			).toEqual({
				id: "audit-log-copy",
				title: "Asynchronous audit log module",
				targetPath: "../../../nest/template",
				bundle: BUNDLE,
			});
		});

		it("keeps the dialog open with the server's refusal in words", async () => {
			serving({
				status: 409,
				body: { error: "Case audit-log already has a directory under cases/" },
			});

			const dialog = await chooseBundle(JSON.stringify(BUNDLE));
			await within(dialog).findByLabelText("Id");
			fireEvent.click(within(dialog).getByRole("button", { name: "Import" }));

			expect(await within(dialog).findByRole("alert")).toHaveTextContent(
				"Case audit-log already has a directory under cases/",
			);
		});

		it("names a file that is not JSON before asking the server", async () => {
			const server = serving();

			const dialog = await chooseBundle("not json");

			expect(await within(dialog).findByRole("alert")).toHaveTextContent(
				"The file is not JSON, so it is no task bundle",
			);
			expect(server.posted("/api/task-bundles/preview")).toHaveLength(0);
		});
	});

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

	describe("editing a task's steps", () => {
		const STEPS_PATH = "/api/cases/audit-log/steps";
		const PLANNING_RUBRIC = "cases/audit-log/rubrics/shape.json";
		const DELIVERY_RUBRIC = "cases/audit-log/rubrics/build.json";
		const SHAPING_STEP = {
			name: "shape",
			kind: "planning",
			skill: "shape",
			rubric: PLANNING_RUBRIC,
			requiresAcceptanceCriteria: true,
		};
		const BUILD_STEP = {
			name: "build",
			kind: "delivery",
			skill: "build",
			rubric: DELIVERY_RUBRIC,
		};
		const DECLARED_STEPS = {
			caseId: "audit-log",
			pipeline: TASK_PATH,
			stages: [SHAPING_STEP, BUILD_STEP],
			rubrics: [DELIVERY_RUBRIC, PLANNING_RUBRIC],
		};

		function serving(refusal?: Reply): FakeServer {
			const response: PipelinesResponse = {
				pipelines: [declaredTask(), overrideTask()],
				unreadable: [],
			};
			const server = new FakeServer(
				new Map<string, Reply>([
					...[...SHELL_BASELINE].map(([path, body]): [string, Reply] => [
						`GET ${path}`,
						{ status: 200, body },
					]),
					["GET /api/pipelines", { status: 200, body: response }],
					[`GET ${STEPS_PATH}`, { status: 200, body: DECLARED_STEPS }],
					[
						`PUT ${STEPS_PATH}`,
						refusal ?? { status: 200, body: DECLARED_STEPS },
					],
				]),
			);
			server.install();
			renderAppAt("/tasks");

			return server;
		}

		async function openEditor(): Promise<HTMLElement> {
			const card = await screen.findByRole("article", { name: TASK_PATH });
			fireEvent.click(within(card).getByRole("button", { name: "Edit steps" }));
			const dialog = await screen.findByRole("dialog", {
				name: "Edit steps · audit-log",
			});
			await within(dialog).findByRole("group", { name: "Step 1" });

			return dialog;
		}

		const savedStepsSchema = z.object({
			stages: z.array(z.record(z.string(), z.unknown())),
		});

		function savedSteps(
			sent: readonly Readonly<SentRequest>[],
		): z.infer<typeof savedStepsSchema> {
			const put = sent.filter(
				({ method, pathname }) => method === "PUT" && pathname === STEPS_PATH,
			);
			expect(put).toHaveLength(1);

			return savedStepsSchema.parse(JSON.parse(put[0]?.body ?? ""));
		}

		it("opens the steps its case's pipeline file declares", async () => {
			serving();

			const dialog = await openEditor();
			const build = within(dialog).getByRole("group", { name: "Step 2" });

			expect(within(build).getByLabelText("Name")).toHaveValue("build");
			expect(within(build).getByLabelText("Kind")).toHaveValue("delivery");
			expect(within(build).getByLabelText("Skill")).toHaveValue("build");
			expect(within(build).getByLabelText("Rubric")).toHaveValue(
				DELIVERY_RUBRIC,
			);
			expect(dialog).toHaveTextContent(TASK_PATH);
		});

		it("saves an edited skill into the case's pipeline and closes", async () => {
			const server = serving();

			const dialog = await openEditor();
			const build = within(dialog).getByRole("group", { name: "Step 2" });
			fireEvent.change(within(build).getByLabelText("Skill"), {
				target: { value: "deliver" },
			});
			fireEvent.click(
				within(dialog).getByRole("button", { name: "Save steps" }),
			);

			await waitFor(() => {
				expect(screen.queryByRole("dialog")).toBeNull();
			});
			expect(savedSteps(server.sent)).toEqual({
				stages: [SHAPING_STEP, { ...BUILD_STEP, skill: "deliver" }],
			});
		});

		it("adds, moves and removes steps before it saves them in their new order", async () => {
			const server = serving();

			const dialog = await openEditor();
			fireEvent.click(
				within(dialog).getByRole("button", { name: "Add a step" }),
			);
			const added = within(dialog).getByRole("group", { name: "Step 3" });
			fireEvent.change(within(added).getByLabelText("Name"), {
				target: { value: "verify" },
			});
			fireEvent.change(within(added).getByLabelText("Skill"), {
				target: { value: "verify" },
			});
			fireEvent.click(within(added).getByRole("button", { name: "Move up" }));
			fireEvent.click(
				within(within(dialog).getByRole("group", { name: "Step 1" })).getByRole(
					"button",
					{ name: "Remove" },
				),
			);
			fireEvent.click(
				within(dialog).getByRole("button", { name: "Save steps" }),
			);

			await waitFor(() => {
				expect(screen.queryByRole("dialog")).toBeNull();
			});
			expect(savedSteps(server.sent)).toEqual({
				stages: [
					{
						name: "verify",
						kind: "delivery",
						skill: "verify",
						rubric: DELIVERY_RUBRIC,
					},
					BUILD_STEP,
				],
			});
		});

		it("keeps the editor open with the server's refusal in words", async () => {
			serving({
				status: 400,
				body: {
					error: "Pipeline stage build names a rubric it cannot use",
				},
			});

			const dialog = await openEditor();
			fireEvent.click(
				within(dialog).getByRole("button", { name: "Save steps" }),
			);

			expect(await within(dialog).findByRole("alert")).toHaveTextContent(
				"Pipeline stage build names a rubric it cannot use",
			);
		});

		it("offers no editor for a pipeline no case declares, which has no file of its own to edit", async () => {
			serving();

			const card = await screen.findByRole("article", {
				name: "cases/audit-log/pipelines/build-only.json",
			});

			expect(
				within(card).queryByRole("button", { name: "Edit steps" }),
			).toBeNull();
		});
	});

	it("opens the live monitor on the newest of its runs in flight", async () => {
		renderTasksWhileRunning([OLDER_RUN, NEWER_RUN, OTHER_TASK_RUN]);

		const card = await screen.findByRole("article", { name: TASK_PATH });

		expect(
			await within(card).findByRole("link", { name: "Open graph" }),
		).toHaveAttribute("href", `/monitor/${NEWER_RUN}`);
	});

	it("opens a run started after the page read its tasks once the run is recorded", async () => {
		renderTasksBeforeTheirRunWasRecorded(NEWER_RUN);

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
		it("names the target its cases ran it against and that its runs recorded no corpus version", async () => {
			const task = overrideTask();
			renderTasksAt("/tasks", [task]);

			const card = await screen.findByRole("article", { name: task.path });

			expect(
				within(card).getByText("../../../nest/template"),
			).toBeInTheDocument();
			expect(
				within(card).getByText(
					"1 run, corpus version not recorded · 1 case · 1 step judge + no task judge",
				),
			).toBeInTheDocument();
			expect(
				within(card).getByText(
					"A run chose this pipeline over its case's default. No case declares it, so it has no task judge of its own.",
				),
			).toBeInTheDocument();
		});
	});

	describe("when no case that ran it is declared any more", () => {
		it("says no declared case names its target", async () => {
			const task = { ...overrideTask(), targets: [] };
			renderTasksAt("/tasks", [task]);

			const card = await screen.findByRole("article", { name: task.path });

			expect(
				within(card).getByText("No declared case names its target"),
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

	describe("when only a confirmation group's reps ran the task", () => {
		it("counts the reps as its runs", async () => {
			renderTasksAt("/tasks", [
				{
					...declaredTask(),
					runs: [],
					figures: { counted: 3, corpusVersion: DIGEST, leftOut: 0 },
				},
			]);

			const card = await screen.findByRole("article", { name: TASK_PATH });

			expect(
				within(card).getByText(
					"3 runs at corpus@e73e56 · 1 case · 2 step judges + 1 task judge",
				),
			).toBeInTheDocument();
		});
	});

	describe("when every run is at the latest corpus version", () => {
		it("says no run was left out", async () => {
			renderTasksAt("/tasks", [
				{
					...declaredTask(),
					figures: { counted: 2, corpusVersion: DIGEST, leftOut: 0 },
				},
			]);

			const card = await screen.findByRole("article", { name: TASK_PATH });

			expect(within(card).queryByText(/left out/u)).not.toBeInTheDocument();
		});
	});

	describe("when the tasks cannot be read", () => {
		it("says so", async () => {
			stubFetchFailing("/api/pipelines");
			renderAppAt("/tasks");

			expect(await screen.findByRole("alert")).toHaveTextContent(
				"Could not load the tasks.",
			);
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
