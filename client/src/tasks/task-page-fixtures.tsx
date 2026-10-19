import { fireEvent, screen, within } from "@testing-library/react";

import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import { stubFetchByPath } from "#client/test-support/fetch-stub";
import {
	SHELL_BASELINE,
	renderAppAt,
	renderAppWithStub,
} from "#client/test-support/render-app";

import type { PipelinesResponse } from "./pipelines-query";

const INITIAL_PIPELINE_READ_NUMBER = 1;

const FIRST_POSTED_REQUEST_INDEX = 0;

const FIRST_TASK_UPDATE_REQUEST_INDEX = 0;

const PIPELINE_READ_COUNT_INCREMENT = 1;

async function chooseBundle(text: string): Promise<HTMLElement> {
	fireEvent.click(
		await screen.findByRole("button", { name: "Import workflow" }),
	);
	const dialog = await screen.findByRole("dialog", {
		name: "Import workflow",
	});
	fireEvent.change(within(dialog).getByLabelText("Workflow bundle"), {
		target: {
			files: [new File([text], "audit-log.task.json")],
		},
	});

	return dialog;
}

const originalFetch = globalThis.fetch;

const TASK_TITLE = "Asynchronous audit log module against the NestJS template";

const TASK_PATH = "cases/audit-log/pipelines/default.json";

const OLDER_RUN = "2026-09-28T10-03-07.498Z";

const NEWER_RUN = "2026-10-01T22-07-54.847Z";

const OTHER_TASK_RUN = "2026-10-02T09-00-00.000Z";

const DIGEST =
	"e73e56621fca244376a085a27f68834c9e15038e7f53966ff1aff9b199891922";

type ListedPipeline = PipelinesResponse["pipelines"][number];

function declaredTask(): ListedPipeline {
	return {
		cases: ["audit-log"],
		declaredBy: {
			id: "audit-log",
			target: "../../../nest/template",
			title: "Asynchronous audit log module against the NestJS template",
		},
		figures: { corpusVersion: DIGEST, counted: 14, leftOut: 12 },
		path: TASK_PATH,
		runs: [NEWER_RUN, OLDER_RUN],
		stageJudges: 2,
		stages: ["shape", "build"],
		targets: ["../../../nest/template"],
		taskJudges: 1,
	};
}

function overrideTask(): ListedPipeline {
	return {
		cases: ["audit-log"],
		declaredBy: null,
		figures: { corpusVersion: null, counted: 1, leftOut: 0 },
		path: "cases/audit-log/pipelines/build-only.json",
		runs: [NEWER_RUN],
		stageJudges: 1,
		stages: ["build"],
		targets: ["../../../nest/template"],
		taskJudges: 0,
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
		launches: [],
		rows: inFlight.map((run) =>
			new PipelineRunRowBuilder({ run }).withExecutionProgress().build(),
		),
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
		launches: [],
		rows: [new PipelineRunRowBuilder({ run }).withExecutionProgress().build()],
		unreadable: [],
	};
	let pipelineReads = 0;
	const stub = async (request: string | URL | Request): Promise<Response> => {
		const { pathname } = new URL(
			request instanceof Request ? request.url : request,
			"http://localhost",
		);
		if (pathname === "/api/pipelines") {
			pipelineReads += PIPELINE_READ_COUNT_INCREMENT;

			return Response.json(
				pipelineReads === INITIAL_PIPELINE_READ_NUMBER ? before : after,
			);
		}

		if (pathname === "/api/run-listing") {
			return Response.json(history);
		}

		return await answerBaseline(request);
	};
	stub.preconnect = answerBaseline.preconnect;
	globalThis.fetch = stub;
	renderAppAt("/tasks");
}

export {
	DIGEST,
	FIRST_POSTED_REQUEST_INDEX,
	FIRST_TASK_UPDATE_REQUEST_INDEX,
	NEWER_RUN,
	OLDER_RUN,
	OTHER_TASK_RUN,
	TASK_PATH,
	TASK_TITLE,
	chooseBundle,
	declaredTask,
	originalFetch,
	overrideTask,
	renderTasksAt,
	renderTasksBeforeTheirRunWasRecorded,
	renderTasksWhileRunning,
};
