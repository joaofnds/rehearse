import { afterEach, describe, expect, it } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import { renderAppWithStub } from "#client/test-support/render-app";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("an address the app does not serve", () => {
	it("says no screen is at this address", async () => {
		renderAppWithStub("/no-such-screen", new Map<string, unknown>());

		await waitFor(() => {
			expect(
				screen.getByRole("heading", { name: "No screen at this address" }),
			).toBeInTheDocument();
		});
	});

	it("names the address that was asked for", async () => {
		renderAppWithStub("/no-such-screen", new Map<string, unknown>());

		await waitFor(() => {
			expect(screen.getByText("/no-such-screen")).toBeInTheDocument();
		});
	});

	it("offers a link back to run history", async () => {
		renderAppWithStub("/no-such-screen", new Map<string, unknown>());

		const link = await screen.findByRole("link", {
			name: "Back to run history",
		});

		expect(link).toHaveAttribute("href", "/");
	});
});
