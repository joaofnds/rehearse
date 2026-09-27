import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { stubFetchByPath } from "#client/test-support/fetch-stub";
import type {
	EvidenceSourceIdentity,
	EvidenceSourceResponse,
} from "./evidence-source-query";
import { EvidenceSourcePage } from "./evidence-source-page";

const RUN = "2026-09-27T00-00-00.000Z";
const STAGE_PATH = `/api/runs/${RUN}/stages/build/evidence/requirements/scope/0`;
const STAGE: EvidenceSourceIdentity = {
	kind: "stage",
	run: RUN,
	stage: "build",
	section: "requirements",
	item: "scope",
	index: "0",
};

const originalFetch = globalThis.fetch;
const originalScrollIntoView = Object.getOwnPropertyDescriptor(
	Element.prototype,
	"scrollIntoView",
);
let scrolledTo: string[] = [];

beforeEach(() => {
	scrolledTo = [];
	Element.prototype.scrollIntoView = function scrollIntoView() {
		scrolledTo.push(this.textContent);
	};
});

afterEach(() => {
	globalThis.fetch = originalFetch;
	if (originalScrollIntoView !== undefined) {
		Object.defineProperty(
			Element.prototype,
			"scrollIntoView",
			originalScrollIntoView,
		);
	}
});

function sourceWith(
	view: EvidenceSourceResponse["view"],
): EvidenceSourceResponse {
	return {
		record: `.benchmark-runs/${RUN}.build.json`,
		source: "diff",
		path: "src/app.ts",
		claim: "the module is wired",
		view,
	};
}

function renderPage(
	identity: EvidenceSourceIdentity,
	byPath: ReadonlyMap<string, unknown>,
): void {
	stubFetchByPath(byPath);
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	render(
		<QueryClientProvider client={client}>
			<EvidenceSourcePage identity={identity} />
		</QueryClientProvider>,
	);
}

describe(EvidenceSourcePage.name, () => {
	it("shows the recorded source read-only with the quoted span marked, scrolled into view, and names the record file", async () => {
		renderPage(
			STAGE,
			new Map([
				[
					STAGE_PATH,
					{
						...sourceWith({
							kind: "text",
							label: "src/app.ts @@ -1 +1,2 @@",
							text: " export {};\n+export const audit = true;\n",
							span: { start: 13, end: 38 },
						}),
						quote: "export const audit = true;",
					},
				],
			]),
		);

		const mark = await screen.findByText("export const audit = true");
		expect(mark.tagName).toBe("MARK");
		expect(mark.closest("pre")?.textContent).toBe(
			" export {};\n+export const audit = true;\n",
		);
		expect(
			screen.getByText(`.benchmark-runs/${RUN}.build.json`),
		).toBeInTheDocument();
		expect(screen.getByText("the module is wired")).toBeInTheDocument();
		expect(screen.getByText("src/app.ts @@ -1 +1,2 @@")).toBeInTheDocument();
		expect(screen.queryByRole("textbox")).toBeNull();
		await waitFor(() => {
			expect(scrolledTo).toEqual(["export const audit = true"]);
		});
	});

	it("says so when the recorded text no longer holds the quote", async () => {
		renderPage(
			STAGE,
			new Map([
				[
					STAGE_PATH,
					sourceWith({ kind: "text", label: "src/app.ts", text: "x" }),
				],
			]),
		);

		expect(
			await screen.findByText(
				"The quote is not in the recorded text, so no span is marked.",
			),
		).toBeInTheDocument();
	});

	it("shows the harness result a harness locator names", async () => {
		renderPage(
			STAGE,
			new Map([
				[
					STAGE_PATH,
					sourceWith({
						kind: "harness",
						result: "localChecks",
						recorded: true,
						value: {
							status: "FAIL",
							evidence: [
								{
									source: "local-checks",
									path: "harness",
									claim: "unit tests exited 1",
								},
							],
						},
					}),
				],
			]),
		);

		expect(
			await screen.findByText("Harness result localChecks: FAIL"),
		).toBeInTheDocument();
		expect(screen.getByText("unit tests exited 1")).toBeInTheDocument();
	});

	it("says the judge's input held no harness result", async () => {
		renderPage(
			STAGE,
			new Map([
				[
					STAGE_PATH,
					sourceWith({
						kind: "harness",
						result: "harnessFailure",
						recorded: false,
					}),
				],
			]),
		);

		expect(
			await screen.findByText(
				"Harness result harnessFailure: the judge's input held none.",
			),
		).toBeInTheDocument();
	});

	it("says a cited source is absent from the record", async () => {
		renderPage(STAGE, new Map([[STAGE_PATH, sourceWith({ kind: "absent" })]]));

		expect(
			await screen.findByText(
				"The record holds no such source, so there is nothing to open.",
			),
		).toBeInTheDocument();
	});

	it("says an item was recorded before quoted spans", async () => {
		renderPage(
			STAGE,
			new Map([[STAGE_PATH, sourceWith({ kind: "before-quoted-spans" })]]),
		);

		expect(
			await screen.findByText(
				"This evidence was recorded before quoted spans, so it names no span to open.",
			),
		).toBeInTheDocument();
	});

	it("opens the final judge's evidence", async () => {
		renderPage(
			{ kind: "final", run: RUN, item: "tests", index: "0" },
			new Map([
				[
					`/api/runs/${RUN}/final/evidence/tests/0`,
					sourceWith({ kind: "before-quoted-spans" }),
				],
			]),
		);

		expect(await screen.findByText("the module is wired")).toBeInTheDocument();
	});

	it("says the evidence item could not be opened", async () => {
		renderPage(STAGE, new Map());

		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Could not open this evidence item.",
		);
	});
});
