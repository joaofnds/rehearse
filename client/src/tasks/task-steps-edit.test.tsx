import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import {
	fireEvent,
	screen,
	waitFor,
	waitForElementToBeRemoved,
	within,
} from "@testing-library/react";
import { z } from "zod";

import type { Reply, SentRequest } from "#client/test-support/fetch-stub";
import { FakeServer } from "#client/test-support/fetch-stub";
import { SHELL_BASELINE, renderAppAt } from "#client/test-support/render-app";

import type { PipelinesResponse } from "./pipelines-query";
import {
	FIRST_TASK_UPDATE_REQUEST_INDEX,
	TASK_PATH,
	TASK_TITLE,
	declaredTask,
	originalFetch,
	overrideTask,
} from "./task-page-fixtures";
import TasksPage from "./tasks-page";

const STEPS_PATH = "/api/cases/audit-log/steps";

const PLANNING_RUBRIC = "cases/audit-log/rubrics/shape.json";

const DELIVERY_RUBRIC = "cases/audit-log/rubrics/build.json";

const SHAPING_STEP = {
	kind: "planning",
	name: "shape",
	requiresAcceptanceCriteria: true,
	rubric: PLANNING_RUBRIC,
	skill: "shape",
};

const BUILD_STEP = {
	kind: "delivery",
	name: "build",
	rubric: DELIVERY_RUBRIC,
	skill: "build",
};

const DECLARED_STEPS = {
	caseId: "audit-log",
	pipeline: TASK_PATH,
	rubrics: [DELIVERY_RUBRIC, PLANNING_RUBRIC],
	stages: [SHAPING_STEP, BUILD_STEP],
};

function serving(refusal?: Reply, page = "/tasks"): FakeServer {
	const response: PipelinesResponse = {
		pipelines: [declaredTask(), overrideTask()],
		unreadable: [],
	};
	const server = new FakeServer(
		new Map<string, Reply>([
			...[...SHELL_BASELINE].map(([path, body]): [string, Reply] => [
				`GET ${path}`,
				{ body, status: 200 },
			]),
			["GET /api/pipelines", { body: response, status: 200 }],
			[`GET ${STEPS_PATH}`, { body: DECLARED_STEPS, status: 200 }],
			[`PUT ${STEPS_PATH}`, refusal ?? { body: DECLARED_STEPS, status: 200 }],
		]),
	);
	server.install();
	renderAppAt(page);

	return server;
}

async function openEditor(): Promise<HTMLElement> {
	const card = await screen.findByRole("article", { name: TASK_TITLE });
	fireEvent.click(within(card).getByRole("button", { name: "Edit steps" }));
	const dialog = await screen.findByRole("dialog", {
		name: "Edit steps · audit-log",
	});
	await within(dialog).findByRole("group", { name: "Step 1" });

	return dialog;
}

const savedStageSchema = z.record(z.string(), z.unknown());

const savedStepsSchema = z.object({ stages: z.array(savedStageSchema) });

function savedSteps(
	put: readonly Readonly<SentRequest>[],
): z.infer<typeof savedStepsSchema> {
	return savedStepsSchema.parse(
		JSON.parse(put[FIRST_TASK_UPDATE_REQUEST_INDEX]?.body ?? ""),
	);
}

const EXPECTED_PUT_REQUESTS = 1;

afterEach(() => {
	globalThis.fetch = originalFetch;
});
describe(TasksPage.name, () => {
	describe("editing a task's steps", () => {
		it(
			"opens the steps its case's pipeline file declares",
			opensTheStepsItsCaseSPipelineFileDeclares,
		);

		it(
			"saves an edited skill from Cases → Workflows and closes",
			savesAnEditedSkillFromCasesWorkflowsAndCloses,
		);

		describe("after adding a delivery step", addedDeliveryStep);

		it(
			"keeps the editor open with the server's refusal in words",
			keepsTheEditorOpenWithTheServerSRefusalInWords,
		);

		it(
			"offers no editor for a pipeline no case declares, which has no file of its own to edit",
			offersNoEditorForAPipelineNoCaseDeclaresWhichHasNoFileOfItsOwnToEdit,
		);
	});
});

async function opensTheStepsItsCaseSPipelineFileDeclares(): Promise<void> {
	serving();

	const dialog = await openEditor();
	const build = within(dialog).getByRole("group", { name: "Step 2" });

	expect(within(build).getByLabelText("Name")).toHaveValue("build");
	expect(within(build).getByLabelText("Kind")).toHaveValue("delivery");
	expect(within(build).getByLabelText("Skill")).toHaveValue("build");
	expect(within(build).getByLabelText("Rubric")).toHaveValue(DELIVERY_RUBRIC);
	expect(dialog).toHaveTextContent(TASK_PATH);
}

async function savesAnEditedSkillFromCasesWorkflowsAndCloses(): Promise<void> {
	const server = serving(undefined, "/cases?view=workflows&caseId=audit-log");

	const dialog = await openEditor();
	const build = within(dialog).getByRole("group", { name: "Step 2" });
	fireEvent.change(within(build).getByLabelText("Skill"), {
		target: { value: "deliver" },
	});
	fireEvent.click(within(dialog).getByRole("button", { name: "Save steps" }));

	await waitForElementToBeRemoved(() => screen.queryByRole("dialog"));
	const put = server.sent.filter(
		({ method, pathname }) => method === "PUT" && pathname === STEPS_PATH,
	);
	expect(put).toHaveLength(EXPECTED_PUT_REQUESTS);
	expect(savedSteps(put)).toEqual({
		stages: [SHAPING_STEP, { ...BUILD_STEP, skill: "deliver" }],
	});
}

let editingServer: FakeServer | null = null;
let editingDialog: HTMLElement | null = null;
function addedDeliveryStep(): void {
	beforeEach(prepareAddedDeliveryStep);
	it(
		"adds, moves and removes steps before it saves them in their new order",
		savesReorderedSteps,
	);
}
async function prepareAddedDeliveryStep(): Promise<void> {
	editingServer = serving();
	editingDialog = await openEditor();
	const dialog = editingDialog;
	fireEvent.click(within(dialog).getByRole("button", { name: "Add a step" }));
	const added = within(dialog).getByRole("group", { name: "Step 3" });
	fireEvent.change(within(added).getByLabelText("Name"), {
		target: { value: "verify" },
	});
	fireEvent.change(within(added).getByLabelText("Skill"), {
		target: { value: "verify" },
	});
}
async function savesReorderedSteps(): Promise<void> {
	if (editingServer === null || editingDialog === null) {
		throw new Error("The added delivery step was not prepared");
	}
	const added = within(editingDialog).getByRole("group", { name: "Step 3" });
	fireEvent.click(within(added).getByRole("button", { name: "Move up" }));
	fireEvent.click(
		within(
			within(editingDialog).getByRole("group", { name: "Step 1" }),
		).getByRole("button", { name: "Remove" }),
	);
	fireEvent.click(
		within(editingDialog).getByRole("button", { name: "Save steps" }),
	);
	await waitForElementToBeRemoved(() => screen.queryByRole("dialog"));
	const put = editingServer.sent.filter(
		({ method, pathname }) => method === "PUT" && pathname === STEPS_PATH,
	);
	expect(put).toHaveLength(EXPECTED_PUT_REQUESTS);
	expect(savedSteps(put)).toEqual({
		stages: [
			{
				kind: "delivery",
				name: "verify",
				rubric: DELIVERY_RUBRIC,
				skill: "verify",
			},
			BUILD_STEP,
		],
	});
}

async function keepsTheEditorOpenWithTheServerSRefusalInWords(): Promise<void> {
	serving({
		body: {
			error: "Pipeline stage build names a rubric it cannot use",
		},
		status: 400,
	});

	const dialog = await openEditor();
	fireEvent.click(within(dialog).getByRole("button", { name: "Save steps" }));

	expect(await within(dialog).findByRole("alert")).toHaveTextContent(
		"Pipeline stage build names a rubric it cannot use",
	);
}

async function offersNoEditorForAPipelineNoCaseDeclaresWhichHasNoFileOfItsOwnToEdit(): Promise<void> {
	serving();

	const card = await screen.findByRole("article", {
		name: "build workflow",
	});

	expect(within(card).queryByRole("button", { name: "Edit steps" })).toBeNull();
}
