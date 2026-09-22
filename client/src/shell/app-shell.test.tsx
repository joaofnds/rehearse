import { afterEach, describe, expect, it } from "bun:test";
import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import type { CorpusResponse } from "#client/corpus/corpus-query";
import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import { stubFetchByPath } from "#client/test-support/fetch-stub";
import { createAppRouter } from "#client/router";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

type RunHistoryRow = RunHistoryResponse["rows"][number];
type CorpusFile = CorpusResponse["files"][number];

function runRow(run: string): RunHistoryRow {
	return {
		run,
		caseId: "audit-log",
		status: "COMPLETE",
		stage: "build",
		grade: "B",
		corpus: { digest: "a3a62f" },
		stale: false,
		staleCauses: [],
		progress: { state: "recorded" },
	};
}

function corpusFile(path: string): CorpusFile {
	return {
		path,
		sha256: "a".repeat(64),
		lastEditedAt: "2026-09-22T09:12:00.000Z",
		readBy: 0,
	};
}

function renderShellAt(
	path: string,
	served?: { readonly runs: number; readonly corpusFiles: number },
): void {
	const runs = served?.runs ?? 0;
	const corpusFiles = served?.corpusFiles ?? 0;

	stubFetchByPath(
		new Map<string, unknown>([
			[
				"/api/runs",
				{
					rows: Array.from({ length: runs }, (_unused, index) =>
						runRow(`2026-09-06T21-58-29.50${index}Z`),
					),
					unreadable: [],
				},
			],
			[
				"/api/corpus",
				{
					root: "/corpus",
					digest: "ffd58d",
					files: Array.from({ length: corpusFiles }, (_unused, index) =>
						corpusFile(`file-${index}.md`),
					),
					refusals: [],
				},
			],
		]),
	);

	renderRouterAt(path);
}

function renderRouterAt(path: string): void {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const router = createAppRouter({
		history: createMemoryHistory({ initialEntries: [path] }),
	});

	render(
		<QueryClientProvider client={client}>
			<RouterProvider router={router} />
		</QueryClientProvider>,
	);
}

const SPEC_NAV_LABELS = [
	"Run history",
	"Live monitor",
	"Run detail",
	"Comparisons",
	"Corpus",
	"Tasks",
	"Cases",
	"Calibration",
	"Settings",
];

describe("the navigation shell", () => {
	it("lists the design's nine sections in its order", async () => {
		renderShellAt("/");

		await waitFor(() => {
			expect(
				screen.getByRole("navigation", { name: "Sections" }),
			).toBeInTheDocument();
		});

		const items = screen.getAllByRole("listitem");

		expect(items).toHaveLength(SPEC_NAV_LABELS.length);
		expect(
			items.map((item) => item.querySelector(".rh-nav__label")?.textContent),
		).toEqual(SPEC_NAV_LABELS);
	});

	it("offers no link for a section that has no screen", async () => {
		renderShellAt("/");

		await waitFor(() => {
			expect(
				screen.getByRole("navigation", { name: "Sections" }),
			).toBeInTheDocument();
		});

		const linked = screen
			.getAllByRole("link")
			.map((link) => link.querySelector(".rh-nav__label")?.textContent);

		expect(linked).toEqual(["Run history", "Corpus"]);
	});

	it("names the corpus under test on every screen", async () => {
		renderShellAt("/", { runs: 0, corpusFiles: 137 });

		const card = await screen.findByRole("region", {
			name: "Corpus under test",
		});

		await waitFor(() => {
			expect(within(card).getByText("corpus root@ffd58d")).toBeInTheDocument();
		});
		expect(within(card).getByText("137 files")).toBeInTheDocument();
		expect(screen.queryByText("corpus@ffd58d")).not.toBeInTheDocument();
	});

	it.each(["/", "/corpus", "/system", "/runs/run-a/stages/build"])(
		"names the corpus under test on %s",
		async (path) => {
			renderShellAt(path, { runs: 0, corpusFiles: 137 });

			const card = await screen.findByRole("region", {
				name: "Corpus under test",
			});

			await waitFor(() => {
				expect(
					within(card).getByText("corpus root@ffd58d"),
				).toBeInTheDocument();
			});
		},
	);

	it("withholds the digest in words when a file refused hashing", async () => {
		stubFetchByPath(
			new Map<string, unknown>([
				["/api/runs", { rows: [], unreadable: [] }],
				[
					"/api/corpus",
					{
						root: "/corpus",
						files: [corpusFile("CLAUDE.md")],
						refusals: ["skills/a resolves outside the corpus source"],
					},
				],
			]),
		);
		renderRouterAt("/");

		const card = await screen.findByRole("region", {
			name: "Corpus under test",
		});

		await waitFor(() => {
			expect(within(card).getByText(/withheld/u)).toBeInTheDocument();
		});
		expect(within(card).getByText(/1 refusal/u)).toBeInTheDocument();
		expect(within(card).queryByText(/corpus root@/u)).not.toBeInTheDocument();
	});

	it("counts each section's own collection in its badge", async () => {
		renderShellAt("/", { runs: 4, corpusFiles: 137 });

		const nav = await screen.findByRole("navigation", { name: "Sections" });

		await waitFor(() => {
			expect(within(nav).getByText("4")).toBeInTheDocument();
			expect(within(nav).getByText("137")).toBeInTheDocument();
		});
	});

	it("moves a badge when the served collection changes", async () => {
		renderShellAt("/", { runs: 2, corpusFiles: 9 });

		const nav = await screen.findByRole("navigation", { name: "Sections" });

		await waitFor(() => {
			expect(within(nav).getByText("2")).toBeInTheDocument();
			expect(within(nav).getByText("9")).toBeInTheDocument();
		});
	});

	it("navigates between run history and corpus by click", async () => {
		renderShellAt("/");

		await waitFor(() => {
			expect(
				screen.getByRole("heading", { name: "Run history" }),
			).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole("link", { name: /Corpus/u }));

		await waitFor(() => {
			expect(
				screen.getByRole("heading", { name: "Instruction corpus" }),
			).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole("link", { name: /Run history/u }));

		await waitFor(() => {
			expect(
				screen.getByRole("heading", { name: "Run history" }),
			).toBeInTheDocument();
		});
	});

	it("marks the open screen's own section as the current page", async () => {
		renderShellAt("/corpus");

		await waitFor(() => {
			expect(
				screen.getByRole("heading", { name: "Instruction corpus" }),
			).toBeInTheDocument();
		});

		expect(screen.getByRole("link", { name: /Corpus/u })).toHaveAttribute(
			"aria-current",
			"page",
		);
		expect(
			screen.getByRole("link", { name: /Run history/u }),
		).not.toHaveAttribute("aria-current");
	});

	it("says in words that a section without a screen is planned", async () => {
		renderShellAt("/");

		await waitFor(() => {
			expect(
				screen.getByRole("navigation", { name: "Sections" }),
			).toBeInTheDocument();
		});

		const planned = screen.getAllByText("planned");

		expect(planned).toHaveLength(7);
	});

	it("gives the page one main landmark, the shell's own", async () => {
		renderShellAt("/");

		await waitFor(() => {
			expect(
				screen.getByRole("heading", { name: "Run history" }),
			).toBeInTheDocument();
		});

		expect(screen.getAllByRole("main")).toHaveLength(1);
	});

	it("leads from the landing screen to the corpus screen", async () => {
		renderShellAt("/");

		await waitFor(() => {
			expect(screen.getByRole("link", { name: /Corpus/u })).toHaveAttribute(
				"href",
				"/corpus",
			);
		});
	});
});
