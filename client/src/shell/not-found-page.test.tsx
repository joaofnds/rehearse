import { afterEach, describe, expect, it } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { createAppRouter } from "#client/router";
import { stubFetchByPath } from "#client/test-support/fetch-stub";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function renderRouterAt(path: string): void {
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

describe("an address the app does not serve", () => {
	it("says no screen is at this address", async () => {
		renderRouterAt("/no-such-screen");

		await waitFor(() => {
			expect(
				screen.getByRole("heading", { name: "No screen at this address" }),
			).toBeInTheDocument();
		});
	});

	it("names the address that was asked for", async () => {
		renderRouterAt("/no-such-screen");

		await waitFor(() => {
			expect(screen.getByText("/no-such-screen")).toBeInTheDocument();
		});
	});

	it("offers a link back to run history", async () => {
		renderRouterAt("/no-such-screen");

		const link = await screen.findByRole("link", {
			name: "Back to run history",
		});

		expect(link).toHaveAttribute("href", "/");
	});
});
