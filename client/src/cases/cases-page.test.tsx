import { afterEach, describe, expect, it } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { CasesResponse } from "./cases-query";
import { CasesPage } from "./cases-page";
import type { Reply } from "#client/test-support/fetch-stub";
import { FakeServer } from "#client/test-support/fetch-stub";
import { LiveReply } from "#client/test-support/live-reply";
import {
	renderAppAt,
	renderAppWithStub,
	SHELL_BASELINE,
	stubFetchFailing,
} from "#client/test-support/render-app";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

const DIGEST =
	"e73e56621fca244376a085a27f68834c9e15038e7f53966ff1aff9b199891922";

type ListedCase = CasesResponse["cases"][number];
type PipelineCase = Extract<ListedCase, { kind: "pipeline" }>;
type SessionCase = Extract<ListedCase, { kind: "session" }>;

function pipelineCase(overrides: Partial<PipelineCase> = {}): PipelineCase {
	return {
		id: "audit-log",
		kind: "pipeline",
		title: "Asynchronous audit log module against the NestJS template",
		model: "sonnet",
		target: "../../../nest/template",
		pipeline: {
			state: "available",
			stages: [
				{ name: "shape", rubric: "cases/audit-log/rubrics/shape.json" },
				{ name: "build", rubric: "cases/audit-log/rubrics/build.json" },
			],
		},
		finalRubric: "final-rubric.md",
		figures: {
			state: "measured",
			corpusVersion: DIGEST,
			counted: 4,
			leftOut: 2,
			judged: 3,
			passed: 2,
			median: "PASS",
			costPerRun: { meanUsd: 3.5, costed: 3, lacking: 1 },
		},
		latestMinimumGrade: { state: "recorded", letter: "B" },
		...overrides,
	};
}

function sessionCase(overrides: Partial<SessionCase> = {}): SessionCase {
	return {
		id: "brief-reply",
		kind: "session",
		title: "Reply in the brief style",
		model: "sonnet",
		target: null,
		checks: ["word-band", "forbidden-text"],
		figures: {
			state: "measured",
			corpusVersion: DIGEST,
			counted: 3,
			leftOut: 0,
			judged: 3,
			passed: 2,
			costPerRun: { meanUsd: 0.5, costed: 3, lacking: 0 },
		},
		...overrides,
	};
}

function renderCasesAt(
	path: string,
	cases: readonly ListedCase[],
	problems: Partial<Omit<CasesResponse, "cases">> = {},
): void {
	const response: CasesResponse = {
		cases: [...cases],
		unreadable: [...(problems.unreadable ?? [])],
		unreadableRecords: [...(problems.unreadableRecords ?? [])],
	};
	renderAppWithStub(
		path,
		new Map<string, unknown>([
			["/api/cases", response],
			[
				"/api/settings",
				{
					spendCeilingUsd: 5,
					setCommand: "rehearse settings --spend-ceiling-usd <USD>",
				},
			],
		]),
	);
}

function card(id: string): Promise<HTMLElement> {
	return screen.findByRole("article", { name: id });
}

const DECLARED = {
	id: "declared",
	kind: "session",
	title: "A declared case",
	prompt: "Reply OK.",
	tools: ["Read", "Grep"],
	corpusFiles: ["skills/build/SKILL.md", "CLAUDE.md"],
	checks: [{ kind: "word-band", max: 3 }],
	model: "sonnet",
	sessionBudgetUsd: 0.5,
};

function listing(cases: readonly ListedCase[]): Reply {
	const body: CasesResponse = {
		cases: [...cases],
		unreadable: [],
		unreadableRecords: [],
	};

	return { status: 200, body };
}

/**
 * The Cases screen over a server that lists the declared case once the form
 * has posted it, as the real route does on its next read.
 */
function servingDeclaration(declared: Reply): FakeServer {
	const baseline = [...SHELL_BASELINE].map(([path, body]): [string, Reply] => [
		`GET ${path}`,
		{ status: 200, body },
	]);
	const server: FakeServer = new FakeServer(
		new Map<string, Reply | LiveReply>([
			...baseline,
			[
				"GET /api/cases",
				new LiveReply(() =>
					server.posted("/api/cases").length === 0 || declared.status !== 201
						? listing([pipelineCase()])
						: listing([
								pipelineCase(),
								sessionCase({ id: DECLARED.id, title: DECLARED.title }),
							]),
				),
			],
			["POST /api/cases", declared],
		]),
	);
	server.install();
	renderAppAt("/cases");

	return server;
}

const DECLARED_REPLY: Reply = {
	status: 201,
	body: { declaration: DECLARED, path: "cases/declared/case.json" },
};

async function openDeclareForm(): Promise<HTMLElement> {
	fireEvent.click(
		await screen.findByRole("button", { name: "Declare a case" }),
	);

	return screen.findByRole("dialog", { name: "Declare a case" });
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
	fill("Session budget", "0.5");
}

describe(CasesPage.name, () => {
	it("opens from the Cases nav item under its header naming where cases are declared", async () => {
		renderCasesAt("/", [pipelineCase()]);

		fireEvent.click(await screen.findByRole("link", { name: /^Cases/u }));

		expect(
			await screen.findByRole("heading", { level: 1, name: "Cases" }),
		).toBeInTheDocument();
		expect(
			screen.getByText("Declared as data on disk · cases/*/case.json"),
		).toBeInTheDocument();
	});

	it("opens from Declare a case on the run history's empty state", async () => {
		renderCasesAt("/", [pipelineCase()]);

		fireEvent.click(
			await screen.findByRole("link", { name: "Declare a case" }),
		);

		expect(
			await screen.findByRole("heading", { level: 1, name: "Cases" }),
		).toBeInTheDocument();
	});

	it("shows a pipeline case's kind, target, figures, minimum grade, title and steps on its card", async () => {
		renderCasesAt("/cases", [pipelineCase()]);

		const pipeline = await card("audit-log");

		expect(
			within(pipeline).getByText("task · target repo"),
		).toBeInTheDocument();
		expect(
			within(pipeline).getByText("../../../nest/template"),
		).toBeInTheDocument();
		expect(
			within(pipeline).getByText(
				"4 runs at corpus@e73e56 · median PASS of 3 graded · $3.50/run, 1 run without a cost",
			),
		).toBeInTheDocument();
		expect(
			within(pipeline).getByText(
				"2 runs left out, at another corpus version or none recorded",
			),
		).toBeInTheDocument();
		expect(
			within(pipeline).getByText(
				"Minimum grade B, as the newest pipeline run set it",
			),
		).toBeInTheDocument();
		expect(
			within(pipeline).getByText(
				"Asynchronous audit log module against the NestJS template",
			),
		).toBeInTheDocument();
		expect(within(pipeline).getByText("shape → build")).toBeInTheDocument();
		expect(
			within(pipeline).getByText("2 step rubrics + final-rubric.md"),
		).toBeInTheDocument();
	});

	it("shows a session case with no repository, how many runs passed their checks, and its checks", async () => {
		renderCasesAt("/cases", [sessionCase()]);

		const session = await card("brief-reply");

		expect(
			within(session).getByText("single session · deterministic checks"),
		).toBeInTheDocument();
		expect(within(session).getByText("no repository")).toBeInTheDocument();
		expect(
			within(session).getByText(
				"3 runs at corpus@e73e56 · 2 of 3 passed their checks · $0.50/run",
			),
		).toBeInTheDocument();
		expect(
			within(session).getByText("word-band · forbidden-text"),
		).toBeInTheDocument();
		expect(within(session).queryByText(/median/u)).not.toBeInTheDocument();
		expect(
			within(session).queryByText(/Minimum grade/u),
		).not.toBeInTheDocument();
	});

	describe("when a case never ran", () => {
		it("reads no runs rather than zero figures", async () => {
			renderCasesAt("/cases", [
				pipelineCase({
					figures: { state: "no-runs" },
					latestMinimumGrade: null,
				}),
			]);

			const pipeline = await card("audit-log");

			expect(within(pipeline).getByText("No runs yet")).toBeInTheDocument();
			expect(
				within(pipeline).queryByText(/Minimum grade/u),
			).not.toBeInTheDocument();
		});
	});

	describe("when the newest pipeline run recorded no minimum grade", () => {
		it("says it is not recorded", async () => {
			renderCasesAt("/cases", [
				pipelineCase({ latestMinimumGrade: { state: "not-recorded" } }),
			]);

			expect(
				within(await card("audit-log")).getByText("Minimum grade not recorded"),
			).toBeInTheDocument();
		});
	});

	describe("when no counted run was graded or costed", () => {
		it("says so rather than a figure", async () => {
			renderCasesAt("/cases", [
				pipelineCase({
					figures: {
						state: "measured",
						corpusVersion: null,
						counted: 1,
						leftOut: 0,
						judged: 0,
						passed: 0,
						median: null,
						costPerRun: { meanUsd: null, costed: 0, lacking: 1 },
					},
				}),
			]);

			expect(
				within(await card("audit-log")).getByText(
					"1 run, corpus version not recorded · no run graded · no cost recorded",
				),
			).toBeInTheDocument();
		});
	});

	describe("when no counted session run had its checks run", () => {
		it("says no run was checked rather than none of none passed", async () => {
			renderCasesAt("/cases", [
				sessionCase({
					figures: {
						state: "measured",
						corpusVersion: DIGEST,
						counted: 1,
						leftOut: 0,
						judged: 0,
						passed: 0,
						costPerRun: { meanUsd: 0.5, costed: 1, lacking: 0 },
					},
				}),
			]);

			expect(
				within(await card("brief-reply")).getByText(
					"1 run at corpus@e73e56 · no run checked · $0.50/run",
				),
			).toBeInTheDocument();
		});
	});

	describe("when the harness would refuse a case's pipeline", () => {
		it("says why its steps cannot be shown", async () => {
			renderCasesAt("/cases", [
				pipelineCase({
					pipeline: {
						state: "unavailable",
						reason: "Pipeline stage build names a missing rubric: x.json",
					},
				}),
			]);

			expect(
				within(await card("audit-log")).getByText(
					"Pipeline stage build names a missing rubric: x.json",
				),
			).toBeInTheDocument();
		});
	});

	it.each([
		{ button: "Run once", attempts: "×1" },
		{ button: "Run group", attempts: "×3" },
	])(
		"opens the launch dialog from $button with the case picked and $attempts pressed",
		async ({ button, attempts }) => {
			renderCasesAt("/cases", [sessionCase(), pipelineCase()]);

			fireEvent.click(
				within(await card("audit-log")).getByRole("button", { name: button }),
			);

			const dialog = await screen.findByRole("dialog");
			await within(dialog).findByRole("option", { name: /^audit-log/u });
			await waitFor(() => {
				expect(within(dialog).getByLabelText("Case")).toHaveValue("audit-log");
			});
			expect(
				within(dialog).getByRole("button", { name: attempts }),
			).toHaveAttribute("aria-pressed", "true");
		},
	);

	describe("when a case declares no model", () => {
		it.each(["Run once", "Run group"])(
			"draws %s disabled and says why",
			async (name) => {
				renderCasesAt("/cases", [pipelineCase({ model: null })]);

				const run = within(await card("audit-log")).getByRole("button", {
					name,
				});

				expect(run).toHaveAttribute("aria-disabled", "true");
				expect(run).toHaveAccessibleDescription(
					"Declares no model, so it cannot start",
				);
			},
		);
	});

	describe("when a declaration or a run record cannot be read", () => {
		it("names each beside the cases it could read", async () => {
			renderCasesAt("/cases", [pipelineCase()], {
				unreadable: [{ id: "broken", reason: "not valid JSON" }],
				unreadableRecords: [{ id: "group-x", reason: "JSON Parse error" }],
			});

			expect(
				await screen.findByText("broken: not valid JSON"),
			).toBeInTheDocument();
			expect(screen.getByText("group-x: JSON Parse error")).toBeInTheDocument();
			expect(
				screen.getByRole("article", { name: "audit-log" }),
			).toBeInTheDocument();
		});
	});

	describe("when the cases cannot be read", () => {
		it("says so", async () => {
			stubFetchFailing("/api/cases");
			renderAppAt("/cases");

			expect(await screen.findByRole("alert")).toHaveTextContent(
				"Could not load the cases.",
			);
		});
	});
	describe("when a case is declared", () => {
		it("posts the session declaration the form sets", async () => {
			const server = servingDeclaration(DECLARED_REPLY);
			const form = await openDeclareForm();
			fillDeclared();

			fireEvent.click(within(form).getByRole("button", { name: "Declare" }));

			await waitFor(() => {
				expect(server.posted("/api/cases")).toHaveLength(1);
			});
			const [posted] = server.posted("/api/cases");
			expect(JSON.parse(posted?.body ?? "null")).toEqual(DECLARED);
		});

		it("lists the declared case", async () => {
			servingDeclaration(DECLARED_REPLY);
			const form = await openDeclareForm();
			fillDeclared();

			fireEvent.click(within(form).getByRole("button", { name: "Declare" }));

			expect(await card(DECLARED.id)).toBeInTheDocument();
		});

		it("names the written file and says it needs formatting and a commit", async () => {
			servingDeclaration(DECLARED_REPLY);
			const form = await openDeclareForm();
			fillDeclared();

			fireEvent.click(within(form).getByRole("button", { name: "Declare" }));

			expect(
				await screen.findByText(
					"Declared cases/declared/case.json. The file is uncommitted and unformatted: run bun run fmt, then commit it to keep the case.",
				),
			).toHaveAttribute("role", "status");
		});

		it.each([
			[
				"forbidden-text",
				{ "Check 1 strings": "TODO\nFIXME" },
				{ kind: "forbidden-text", strings: ["TODO", "FIXME"] },
			],
			[
				"forbidden-pattern",
				{
					"Check 1 name": "apology",
					"Check 1 regex": "sorry",
					"Check 1 flags": "i",
				},
				{
					kind: "forbidden-pattern",
					patterns: [{ name: "apology", regex: "sorry", flags: "i" }],
				},
			],
			[
				"tool-calls",
				{ "Check 1 min": "1", "Check 1 names": "Read, Grep" },
				{ kind: "tool-calls", min: 1, names: ["Read", "Grep"] },
			],
			[
				"files-read",
				{ "Check 1 paths": "README.md" },
				{ kind: "files-read", paths: ["README.md"] },
			],
		])(
			"posts a %s check built from its fields",
			async (kind, fields, check) => {
				const server = servingDeclaration(DECLARED_REPLY);
				const form = await openDeclareForm();
				fillDeclared();
				fill("Check 1 kind", kind);
				for (const [label, value] of Object.entries(fields)) {
					fill(label, value);
				}

				fireEvent.click(within(form).getByRole("button", { name: "Declare" }));

				await waitFor(() => {
					expect(server.posted("/api/cases")).toHaveLength(1);
				});
				const [posted] = server.posted("/api/cases");
				expect(JSON.parse(posted?.body ?? "null")).toEqual({
					...DECLARED,
					checks: [check],
				});
			},
		);

		it("posts every check the form adds", async () => {
			const server = servingDeclaration(DECLARED_REPLY);
			const form = await openDeclareForm();
			fillDeclared();
			fireEvent.click(
				within(form).getByRole("button", { name: "Add a check" }),
			);
			fill("Check 2 kind", "files-read");
			fill("Check 2 paths", "README.md");

			fireEvent.click(within(form).getByRole("button", { name: "Declare" }));

			await waitFor(() => {
				expect(server.posted("/api/cases")).toHaveLength(1);
			});
			const [posted] = server.posted("/api/cases");
			expect(JSON.parse(posted?.body ?? "null")).toEqual({
				...DECLARED,
				checks: [
					{ kind: "word-band", max: 3 },
					{ kind: "files-read", paths: ["README.md"] },
				],
			});
		});

		it("shows the pipeline kind disabled, saying it is declared by hand", async () => {
			servingDeclaration(DECLARED_REPLY);

			const form = await openDeclareForm();

			const pipeline = within(form).getByRole("radio", { name: "Pipeline" });
			expect(pipeline).toBeDisabled();
			expect(pipeline).toHaveAccessibleDescription(
				"A pipeline case needs a target repository and its own task files, so it is declared by hand in its case.json",
			);
			expect(
				within(form).getByRole("radio", { name: "Session" }),
			).toBeChecked();
		});

		it("shows the server's refusal and keeps the form open", async () => {
			servingDeclaration({
				status: 409,
				body: { error: "Case declared is already declared" },
			});
			const form = await openDeclareForm();
			fillDeclared();

			fireEvent.click(within(form).getByRole("button", { name: "Declare" }));

			expect(await within(form).findByRole("alert")).toHaveTextContent(
				"Case declared is already declared",
			);
		});
	});
});
