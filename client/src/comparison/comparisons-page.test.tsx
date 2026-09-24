import { afterEach, describe, expect, it } from "bun:test";
import { fireEvent, screen } from "@testing-library/react";
import type { ComparisonIndexResponse } from "./comparison-index-query";
import { renderAppWithStub } from "#client/test-support/render-app";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

const DIGEST =
	"511cd2c4442b4bdcb0ee8be7b979ac5427e2d64a111b68f5253078abe3099ece";

function indexWith(
	index: Partial<ComparisonIndexResponse>,
): ComparisonIndexResponse {
	return { comparisons: [], unreadable: [], ...index };
}

function savedComparison(
	digest: string,
): ComparisonIndexResponse["comparisons"][number] {
	return { digest, mode: "session", caseIds: ["audit-log"], reps: 2 };
}

function renderComparisonsAt(index: ComparisonIndexResponse): void {
	renderAppWithStub("/comparisons", new Map([["/api/comparisons", index]]));
}

describe("/comparisons", () => {
	it("links each saved comparison, named by its digest, to its own page", async () => {
		renderComparisonsAt(indexWith({ comparisons: [savedComparison(DIGEST)] }));

		const link = await screen.findByRole("link", { name: /^511cd2c4442b/u });

		expect(link).toHaveAttribute("href", `/comparisons/${DIGEST}`);
	});

	it("opens a saved comparison's own page when its entry is clicked", async () => {
		renderAppWithStub(
			"/comparisons",
			new Map<string, unknown>([
				[
					"/api/comparisons",
					indexWith({ comparisons: [savedComparison(DIGEST)] }),
				],
				[
					`/api/comparisons/${DIGEST}`,
					{ report: { cases: [] }, attribution: {} },
				],
			]),
		);

		fireEvent.click(
			await screen.findByRole("link", { name: /^511cd2c4442b/u }),
		);

		expect(
			await screen.findByRole("heading", { name: "Comparison" }),
		).toBeInTheDocument();
	});

	it("names each unreadable comparison with its reason", async () => {
		renderComparisonsAt(
			indexWith({
				comparisons: [savedComparison(DIGEST)],
				unreadable: [{ id: "a".repeat(64), reason: "JSON Parse error" }],
			}),
		);

		expect(
			await screen.findByText(`${"a".repeat(64)} — JSON Parse error`),
		).toBeInTheDocument();
	});

	it("says no comparison is saved when there are none", async () => {
		renderComparisonsAt(indexWith({}));

		expect(
			await screen.findByRole("heading", { name: "No comparisons saved" }),
		).toBeInTheDocument();
	});

	describe("when every saved comparison is unreadable", () => {
		it("does not say that none are saved", async () => {
			renderComparisonsAt(
				indexWith({
					unreadable: [{ id: "a".repeat(64), reason: "JSON Parse error" }],
				}),
			);

			await screen.findByText(`${"a".repeat(64)} — JSON Parse error`);

			expect(
				screen.queryByRole("heading", { name: "No comparisons saved" }),
			).not.toBeInTheDocument();
		});
	});

	describe("when the list request fails", () => {
		it("says the comparisons could not be loaded instead of loading forever", async () => {
			renderAppWithStub("/comparisons", new Map());

			expect(await screen.findByRole("alert")).toHaveTextContent(
				"Could not load the saved comparisons.",
			);
			expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
		});
	});
});
