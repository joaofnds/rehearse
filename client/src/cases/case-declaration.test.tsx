import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import type { CheckDeclarationExample } from "./case-declaration-fixtures";
import {
	CHECK_DECLARATIONS,
	DECLARED,
	DECLARED_REPLY,
	PIPELINE_DECLARED,
	fill,
	fillDeclared,
	fillPipeline,
	openDeclareForm,
	servingDeclaration,
} from "./case-declaration-fixtures";
import { card, originalFetch, sessionCase } from "./case-page-fixtures";
import CasesPage from "./cases-page";

const NO_SESSION_DECLARATIONS = 0;

afterEach(() => {
	globalThis.fetch = originalFetch;
});
describe(CasesPage.name, () => {
	describe("when a case is declared", caseDeclarations);
});

async function postsTheSessionDeclarationTheFormSets(): Promise<void> {
	const server = servingDeclaration(DECLARED_REPLY);
	const form = await openDeclareForm();
	fillDeclared();

	fireEvent.click(within(form).getByRole("button", { name: "Declare" }));

	await waitFor(() => {
		const expectedPostedCount = 1;

		expect(server.posted("/api/cases")).toHaveLength(expectedPostedCount);
	});
	const [posted] = server.posted("/api/cases");
	expect(JSON.parse(posted?.body ?? "null")).toEqual(DECLARED);
}

async function listsTheDeclaredCase(): Promise<void> {
	servingDeclaration(DECLARED_REPLY);
	const form = await openDeclareForm();
	fillDeclared();

	fireEvent.click(within(form).getByRole("button", { name: "Declare" }));

	expect(await card(DECLARED.id)).toBeInTheDocument();
}

async function namesTheWrittenFileAndSaysItNeedsACommit(): Promise<void> {
	servingDeclaration(DECLARED_REPLY);
	const form = await openDeclareForm();
	fillDeclared();

	fireEvent.click(within(form).getByRole("button", { name: "Declare" }));

	expect(
		await screen.findByText(
			"Declared cases/declared/case.json. It is uncommitted: review and commit it to keep the case.",
		),
	).toHaveAttribute("role", "status");
}

async function postsEveryCheckTheFormAdds(): Promise<void> {
	const server = servingDeclaration(DECLARED_REPLY);
	const form = await openDeclareForm();
	fillDeclared();
	fireEvent.click(within(form).getByRole("button", { name: "Add a check" }));
	fill("Check 2 kind", "files-read");
	fill("Check 2 paths", "README.md");

	fireEvent.click(within(form).getByRole("button", { name: "Declare" }));

	await waitFor(() => {
		const expectedPostedCount = 1;

		expect(server.posted("/api/cases")).toHaveLength(expectedPostedCount);
	});
	const [posted] = server.posted("/api/cases");
	expect(JSON.parse(posted?.body ?? "null")).toEqual({
		...DECLARED,
		checks: [
			{ kind: "word-band", max: 3 },
			{ kind: "files-read", paths: ["README.md"] },
		],
	});
}

async function isDisabledNamingWhatToDoWhileNoPipelineCaseIsDeclaredToStartFrom(): Promise<void> {
	servingDeclaration(DECLARED_REPLY, undefined, [sessionCase()]);
	const form = await openDeclareForm();

	const pipeline = within(form).getByRole("radio", { name: "Pipeline" });

	expect(pipeline).toBeDisabled();
	expect(pipeline).toHaveAccessibleDescription(
		"A pipeline case starts from another pipeline case's steps and judges, and none is declared. Import a workflow in Cases → Workflows first.",
	);
}

async function showsTheSessionFieldsOnlyForASessionCase(): Promise<void> {
	servingDeclaration(DECLARED_REPLY);
	const form = await openDeclareForm();

	fireEvent.click(within(form).getByRole("radio", { name: "Pipeline" }));

	expect(within(form).queryByLabelText("Prompt")).toBeNull();
	expect(within(form).getByLabelText("Target repository")).toBeVisible();
}

async function showsTheServerSRefusalAndKeepsTheFormOpen(): Promise<void> {
	servingDeclaration({
		body: { error: "Case declared is already declared" },
		status: 409,
	});
	const form = await openDeclareForm();
	fillDeclared();

	fireEvent.click(within(form).getByRole("button", { name: "Declare" }));

	expect(await within(form).findByRole("alert")).toHaveTextContent(
		"Case declared is already declared",
	);
}

async function postsCheckFields({
	kind,
	fields,
	check,
}: CheckDeclarationExample): Promise<void> {
	const server = servingDeclaration(DECLARED_REPLY);
	const form = await openDeclareForm();
	fillDeclared();
	fill("Check 1 kind", kind);
	for (const [label, value] of Object.entries(fields)) {
		fill(label, value);
	}

	fireEvent.click(within(form).getByRole("button", { name: "Declare" }));

	await waitFor(() => {
		const expectedPostedCount = 1;

		expect(server.posted("/api/cases")).toHaveLength(expectedPostedCount);
	});
	const [posted] = server.posted("/api/cases");
	expect(JSON.parse(posted?.body ?? "null")).toEqual({
		...DECLARED,
		checks: [check],
	});
}

async function postsPipelineDeclaration(): Promise<void> {
	const server = servingDeclaration(DECLARED_REPLY, {
		body: { caseId: PIPELINE_DECLARED.id, path: "cases/rename-module" },
		status: 201,
	});
	const form = await openDeclareForm();
	fillPipeline();

	expect(
		within(form).getByRole("combobox", {
			name: "Steps and judges from",
		}),
	).toHaveValue("audit-log");
	fireEvent.click(within(form).getByRole("button", { name: "Declare" }));

	await waitFor(() => {
		const expectedPipelineDeclarationCount = 1;

		expect(server.posted("/api/cases/pipeline")).toHaveLength(
			expectedPipelineDeclarationCount,
		);
	});
	const [posted] = server.posted("/api/cases/pipeline");
	expect(JSON.parse(posted?.body ?? "null")).toEqual(PIPELINE_DECLARED);
	expect(server.posted("/api/cases")).toHaveLength(NO_SESSION_DECLARATIONS);
	expect(
		await screen.findByText(
			"Declared cases/rename-module. It is uncommitted: review and commit it to keep the case.",
		),
	).toHaveAttribute("role", "status");
}
async function keepsRefusedPipelineFormOpen(): Promise<void> {
	servingDeclaration(DECLARED_REPLY, {
		body: { error: "Target /work/template is not a git repository" },
		status: 400,
	});
	const form = await openDeclareForm();
	fillPipeline();

	fireEvent.click(within(form).getByRole("button", { name: "Declare" }));

	expect(await within(form).findByRole("alert")).toHaveTextContent(
		"Target /work/template is not a git repository",
	);
}

function pipelineDeclarations(): void {
	it(
		"posts the task, the brief and the case whose steps and judges it starts from",
		postsPipelineDeclaration,
	);

	it(
		"is disabled, naming what to do, while no pipeline case is declared to start from",
		isDisabledNamingWhatToDoWhileNoPipelineCaseIsDeclaredToStartFrom,
	);

	it(
		"shows the session fields only for a session case",
		showsTheSessionFieldsOnlyForASessionCase,
	);

	it(
		"shows the server's refusal and keeps the form open",
		keepsRefusedPipelineFormOpen,
	);
}

function caseDeclarations(): void {
	it(
		"posts the session declaration the form sets",
		postsTheSessionDeclarationTheFormSets,
	);

	it("lists the declared case", listsTheDeclaredCase);

	it(
		"names the written file and says it needs a commit",
		namesTheWrittenFileAndSaysItNeedsACommit,
	);

	it.each([...CHECK_DECLARATIONS])(
		"posts a $kind check built from its fields",
		postsCheckFields,
	);

	it("posts every check the form adds", postsEveryCheckTheFormAdds);

	describe("as a pipeline case", pipelineDeclarations);

	it(
		"shows the server's refusal and keeps the form open",
		showsTheServerSRefusalAndKeepsTheFormOpen,
	);
}
