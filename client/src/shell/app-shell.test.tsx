import { afterEach, describe, expect, it } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
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

describe("the navigation shell", () => {
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
