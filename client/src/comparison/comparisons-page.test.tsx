import { afterEach, describe, expect, it } from "bun:test";
import { fireEvent, screen, within } from "@testing-library/react";
import type { ComparisonIndexResponse } from "./comparison-index-query";
import { ComparisonsPage } from "./comparisons-page";
import { stubFetchByPath } from "#client/test-support/fetch-stub";
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
	"511cd2c4442b4bdcb0ee8be7b979ac5427e2d64a111b68f5253078abe3099ece";
const OTHER_DIGEST =
	"7e0f9a31c2d84b6e9f1a0c3b5d7e9f1a2b4c6d8e0f1a3b5c7d9e1f2a4b6c8d0e";
const CORRUPT_DIGEST = "a".repeat(64);
const PARSE_ERROR = "JSON Parse error";

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

describe(ComparisonsPage.name, () => {
	it("links each saved comparison, named by its digest, to its own page", async () => {
		renderComparisonsAt(
			indexWith({
				comparisons: [savedComparison(DIGEST), savedComparison(OTHER_DIGEST)],
			}),
		);

		const first = await screen.findByRole("link", { name: /^511cd2c4442b/u });
		const second = screen.getByRole("link", { name: /^7e0f9a31c2d8/u });

		expect(first).toHaveAttribute("href", `/comparisons/${DIGEST}`);
		expect(second).toHaveAttribute("href", `/comparisons/${OTHER_DIGEST}`);
	});

	it("shows each saved comparison's mode, cases and reps", async () => {
		renderComparisonsAt(
			indexWith({
				comparisons: [
					{
						digest: DIGEST,
						mode: "pipeline",
						caseIds: ["audit-log", "brief-reply"],
						reps: 5,
					},
				],
			}),
		);

		const row = await screen.findByRole("row", { name: /^511cd2c4442b/u });

		expect(within(row).getByRole("rowheader")).toHaveTextContent(
			"511cd2c4442b",
		);
		expect(
			within(row)
				.getAllByRole("cell")
				.map((cell) => cell.textContent),
		).toEqual(["pipeline", "audit-log, brief-reply", "5"]);
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
			await screen.findByText(/baseline, candidate and control arms/u),
		).toBeInTheDocument();
	});

	it("names each unreadable comparison with its reason", async () => {
		renderComparisonsAt(
			indexWith({
				comparisons: [savedComparison(DIGEST)],
				unreadable: [{ id: CORRUPT_DIGEST, reason: PARSE_ERROR }],
			}),
		);

		expect(
			await screen.findByText(`${"a".repeat(64)}: JSON Parse error`),
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
					unreadable: [{ id: CORRUPT_DIGEST, reason: PARSE_ERROR }],
				}),
			);

			await screen.findByText(`${CORRUPT_DIGEST}: ${PARSE_ERROR}`);

			expect(
				screen.queryByRole("heading", { name: "No comparisons saved" }),
			).not.toBeInTheDocument();
			expect(
				screen.getByText("1 comparison saved, 1 unreadable"),
			).toBeInTheDocument();
		});
	});

	describe("when the list request fails", () => {
		it("says the comparisons could not be loaded instead of loading forever", async () => {
			stubFetchFailing("/api/comparisons");
			renderAppAt("/comparisons");

			expect(await screen.findByRole("alert")).toHaveTextContent(
				"Could not load the saved comparisons.",
			);
			expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
		});

		it("does not say that none are saved", async () => {
			stubFetchFailing("/api/comparisons");
			renderAppAt("/comparisons");

			await screen.findByRole("alert");

			expect(
				screen.queryByRole("heading", { name: "No comparisons saved" }),
			).not.toBeInTheDocument();
		});
	});

	describe("when the list route answers with an error status", () => {
		it("says the comparisons could not be loaded", async () => {
			stubFetchByPath(
				new Map(
					[...SHELL_BASELINE].filter(([path]) => path !== "/api/comparisons"),
				),
			);
			renderAppAt("/comparisons");

			expect(await screen.findByRole("alert")).toHaveTextContent(
				"Could not load the saved comparisons.",
			);
		});
	});
});
