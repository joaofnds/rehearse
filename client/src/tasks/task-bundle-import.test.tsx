import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, within } from "@testing-library/react";
import { z } from "zod";

import type { Reply } from "#client/test-support/fetch-stub";
import { FakeServer } from "#client/test-support/fetch-stub";
import { SHELL_BASELINE, renderAppAt } from "#client/test-support/render-app";

import type { PipelinesResponse } from "./pipelines-query";
import {
	FIRST_POSTED_REQUEST_INDEX,
	chooseBundle,
	declaredTask,
	originalFetch,
} from "./task-page-fixtures";
import TasksPage from "./tasks-page";

const BUNDLE = { format: "rehearse-task-bundle", version: 1 };

const PREVIEW = {
	caseId: "audit-log",
	commands: ["bun install", "bun test"],
	model: "sonnet",
	services: [
		{
			exports: ["DATABASE_URL", "PGHOST"],
			image: "postgres:18-alpine",
			name: "postgres",
		},
	],
	stepJudges: 1,
	steps: [{ kind: "delivery", name: "build", skill: "build" }],
	targetPath: "../../../nest/template",
	title: "Asynchronous audit log module",
};

const IMPORTED = { caseId: "audit-log-copy", path: "cases/audit-log-copy" };

const IMPORT_ACCEPTED: Reply = { body: IMPORTED, status: 201 };

function serving(imported: Reply = IMPORT_ACCEPTED): FakeServer {
	const response: PipelinesResponse = {
		pipelines: [declaredTask()],
		unreadable: [],
	};
	const server = new FakeServer(
		new Map<string, Reply>([
			...[...SHELL_BASELINE].map(([path, body]): [string, Reply] => [
				`GET ${path}`,
				{ body, status: 200 },
			]),
			["GET /api/pipelines", { body: response, status: 200 }],
			["POST /api/task-bundles/preview", { body: PREVIEW, status: 200 }],
			["POST /api/cases/import", imported],
		]),
	);
	server.install();
	renderAppAt("/tasks");

	return server;
}

const importBodySchema = z.object({
	bundle: z.unknown(),
	id: z.string(),
	targetPath: z.string(),
	title: z.string(),
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});
describe(TasksPage.name, () => {
	describe("importing a task", () => {
		it(
			"shows what the bundle holds and fills the case from it",
			showsWhatTheBundleHoldsAndFillsTheCaseFromIt,
		);

		it(
			"names each container the bundle starts and the variables it sets",
			namesEachContainerTheBundleStartsAndTheVariablesItSets,
		);

		it(
			"imports the bundle under the id typed and says the case is uncommitted",
			importsTheBundleUnderTheIdTypedAndSaysTheCaseIsUncommitted,
		);

		it(
			"keeps the dialog open with the server's refusal in words",
			keepsTheDialogOpenWithTheServerSRefusalInWords,
		);

		it(
			"names a file that is not JSON before asking the server",
			namesAFileThatIsNotJSONBeforeAskingTheServer,
		);
	});
});

async function showsWhatTheBundleHoldsAndFillsTheCaseFromIt(): Promise<void> {
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
		JSON.parse(
			server.posted("/api/task-bundles/preview")[FIRST_POSTED_REQUEST_INDEX]
				?.body ?? "",
		),
	).toEqual({ bundle: BUNDLE });
}

async function namesEachContainerTheBundleStartsAndTheVariablesItSets(): Promise<void> {
	serving();

	const dialog = await chooseBundle(JSON.stringify(BUNDLE));
	const summary = await within(dialog).findByRole("region", {
		name: "What the bundle holds",
	});

	expect(summary).toHaveTextContent(
		"postgres from postgres:18-alpine, setting DATABASE_URL, PGHOST",
	);
}

async function importsTheBundleUnderTheIdTypedAndSaysTheCaseIsUncommitted(): Promise<void> {
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
	const importedBody =
		server.posted("/api/cases/import")[FIRST_POSTED_REQUEST_INDEX]?.body ?? "";
	expect(importBodySchema.parse(JSON.parse(importedBody))).toEqual({
		bundle: BUNDLE,
		id: "audit-log-copy",
		targetPath: "../../../nest/template",
		title: "Asynchronous audit log module",
	});
}

async function keepsTheDialogOpenWithTheServerSRefusalInWords(): Promise<void> {
	serving({
		body: { error: "Case audit-log already has a directory under cases/" },
		status: 409,
	});

	const dialog = await chooseBundle(JSON.stringify(BUNDLE));
	await within(dialog).findByLabelText("Id");
	fireEvent.click(within(dialog).getByRole("button", { name: "Import" }));

	expect(await within(dialog).findByRole("alert")).toHaveTextContent(
		"Case audit-log already has a directory under cases/",
	);
}

async function namesAFileThatIsNotJSONBeforeAskingTheServer(): Promise<void> {
	const expectedPostedCount = 0;

	const server = serving();

	const dialog = await chooseBundle("not json");

	expect(await within(dialog).findByRole("alert")).toHaveTextContent(
		"The file is not JSON, so it is no workflow bundle",
	);
	expect(server.posted("/api/task-bundles/preview")).toHaveLength(
		expectedPostedCount,
	);
}
