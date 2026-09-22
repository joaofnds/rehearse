import { afterEach, describe, expect, it } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { stubFetchByPath } from "#client/test-support/fetch-stub";
import { createAppRouter } from "#client/router";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function renderShellAt(path: string): void {
	stubFetchByPath(
		new Map<string, unknown>([
			["/api/runs", { rows: [], unreadable: [] }],
			[
				"/api/corpus",
				{ root: "/corpus", digest: "ffd58d", files: [], refusals: [] },
			],
		]),
	);

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

		const linked = screen.getAllByRole("link").map((link) => link.textContent);

		expect(linked).toEqual(["Run history", "Corpus"]);
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
