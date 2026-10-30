import { fireEvent, screen } from "@testing-library/react";

import type { Reply } from "#client/test-support/fetch-stub";
import { FakeServer } from "#client/test-support/fetch-stub";
import LiveReply from "#client/test-support/live-reply";
import { SHELL_BASELINE, renderAppAt } from "#client/test-support/render-app";

import type { ListedCase } from "./case-page-fixtures";
import { pipelineCase, sessionCase } from "./case-page-fixtures";
import type { CasesResponse } from "./cases-query";

const HTTP_CREATED_STATUS = 201;

const EMPTY_COLLECTION_LENGTH = 0;

const DECLARED = {
	checks: [{ kind: "word-band", max: 3 }],
	corpusFiles: ["skills/build/SKILL.md", "CLAUDE.md"],
	effort: "high",
	id: "declared",
	kind: "session",
	model: "sonnet",
	prompt: "Reply OK.",
	sessionBudgetUsd: 0.5,
	title: "A declared case",
	tools: ["Read", "Grep"],
};

function listing(cases: readonly ListedCase[]): Reply {
	const body: CasesResponse = {
		cases: [...cases],
		unreadable: [],
		unreadableRecords: [],
	};

	return { body, status: 200 };
}

const NOT_SERVED: Reply = { body: { error: "not served" }, status: 404 };

/**
 * The Cases screen over a server that lists the declared case once the form
 * has posted it, as the real route does on its next read.
 */
function servingDeclaration(
	declared: Reply,
	pipelineDeclared: Reply = NOT_SERVED,
	listed: readonly ListedCase[] = [pipelineCase()],
): FakeServer {
	const baseline = [...SHELL_BASELINE].map(([path, body]): [string, Reply] => [
		`GET ${path}`,
		{ body, status: 200 },
	]);
	const server: FakeServer = new FakeServer(
		new Map<string, Reply | LiveReply>([
			...baseline,
			[
				"GET /api/cases",
				new LiveReply(() =>
					server.posted("/api/cases").length === EMPTY_COLLECTION_LENGTH ||
					declared.status !== HTTP_CREATED_STATUS
						? listing(listed)
						: listing([
								...listed,
								sessionCase({ id: DECLARED.id, title: DECLARED.title }),
							]),
				),
			],
			["POST /api/cases", declared],
			["POST /api/cases/pipeline", pipelineDeclared],
		]),
	);
	server.install();
	renderAppAt("/cases");

	return server;
}

const DECLARED_REPLY: Reply = {
	body: { declaration: DECLARED, path: "cases/declared/case.json" },
	status: 201,
};

async function openDeclareForm(): Promise<HTMLElement> {
	fireEvent.click(
		await screen.findByRole("button", { name: "Declare a case" }),
	);

	return await screen.findByRole("dialog", { name: "Declare a case" });
}

function fill(label: string, value: string): void {
	fireEvent.change(screen.getByLabelText(label), {
		target: { value },
	});
}

function fillDeclared(): void {
	fill("Id", DECLARED.id);
	fill("Title", DECLARED.title);
	fill("Prompt", DECLARED.prompt);
	fill("Tools", "Read, Grep");
	fill("Corpus files", "skills/build/SKILL.md\nCLAUDE.md");
	fill("Check 1 max", "3");
	fill("Model", DECLARED.model);
	fill("Effort", DECLARED.effort);
	fill("Session budget", "0.5");
}

interface CheckDeclarationExample {
	readonly kind: string;
	readonly fields: Readonly<Record<string, string>>;
	readonly check: unknown;
}

const CHECK_DECLARATIONS: readonly CheckDeclarationExample[] = [
	{
		check: { kind: "forbidden-text", strings: ["TODO", "FIXME"] },
		fields: { "Check 1 strings": "TODO\nFIXME" },
		kind: "forbidden-text",
	},
	{
		check: {
			kind: "forbidden-pattern",
			patterns: [{ flags: "i", name: "apology", regex: "sorry" }],
		},
		fields: {
			"Check 1 flags": "i",
			"Check 1 name": "apology",
			"Check 1 regex": "sorry",
		},
		kind: "forbidden-pattern",
	},
	{
		check: { kind: "tool-calls", min: 1, names: ["Read", "Grep"] },
		fields: { "Check 1 min": "1", "Check 1 names": "Read, Grep" },
		kind: "tool-calls",
	},
	{
		check: { kind: "files-read", paths: ["README.md"] },
		fields: { "Check 1 paths": "README.md" },
		kind: "files-read",
	},
];

const PIPELINE_DECLARED = {
	from: "audit-log",
	id: "rename-module",
	productBrief: "# Why\n\nThe name misleads.",
	targetPath: "/work/template",
	task: "# Rename the module",
	title: "Rename the module",
};

function fillPipeline(): void {
	fireEvent.click(screen.getByRole("radio", { name: "Pipeline" }));
	fill("Id", PIPELINE_DECLARED.id);
	fill("Title", PIPELINE_DECLARED.title);
	fill("Target repository", PIPELINE_DECLARED.targetPath);
	fill("Task", PIPELINE_DECLARED.task);
	fill("Product brief", PIPELINE_DECLARED.productBrief);
}

export {
	CHECK_DECLARATIONS,
	DECLARED,
	DECLARED_REPLY,
	PIPELINE_DECLARED,
	fill,
	fillDeclared,
	fillPipeline,
	listing,
	openDeclareForm,
	servingDeclaration,
};
export type { CheckDeclarationExample };
