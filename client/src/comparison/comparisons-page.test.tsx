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
	it("summarizes a shared changed file once while keeping each case in setup", async () => {
		const versions = {
			baseline: { state: "available", digest: "a".repeat(64) },
			candidate: { state: "available", digest: "b".repeat(64) },
			control: { state: "available", digest: "c".repeat(64) },
		} as const;
		renderComparisonsAt(
			indexWith({
				comparisons: [
					{
						...savedComparison(DIGEST),
						caseIds: ["audit-log", "brief-reply"],
						details: ["audit-log", "brief-reply"].map((caseId) => ({
							caseId,
							changedPaths: ["output-styles/brief.md"],
							corpusVersions: versions,
						})),
					},
				],
			}),
		);

		const list = await screen.findByRole("list", { name: "Saved comparisons" });
		expect(
			within(
				within(list).getByRole("list", { name: "Changed instructions" }),
			).getAllByText("output-styles/brief.md").length,
		).toBe(1);
		expect(within(list).getByText("2 requested per arm")).toBeInTheDocument();

		fireEvent.click(within(list).getByText("Setup & record"));

		expect(
			within(list).getByRole("region", { name: "Setup for audit-log" }),
		).toHaveTextContent("output-styles/brief.md");
		expect(
			within(list).getByRole("region", { name: "Setup for brief-reply" }),
		).toHaveTextContent("output-styles/brief.md");
	});

	it("links each saved comparison by case with its digest available", async () => {
		renderComparisonsAt(
			indexWith({
				comparisons: [savedComparison(DIGEST), savedComparison(OTHER_DIGEST)],
			}),
		);

		const first = await screen.findByRole("link", {
			name: /audit-log.*511cd2c4442b/u,
		});
		const second = screen.getByRole("link", {
			name: /audit-log.*7e0f9a31c2d8/u,
		});

		expect(first).toHaveAttribute("href", `/comparisons/${DIGEST}`);
		expect(second).toHaveAttribute("href", `/comparisons/${OTHER_DIGEST}`);
	});

	it("distinguishes matching case names by changed files and the recorded corpus pair", async () => {
		const versions = {
			baseline: { state: "available", digest: "a".repeat(64) },
			candidate: { state: "available", digest: "b".repeat(64) },
			control: { state: "available", digest: "c".repeat(64) },
		} as const;
		renderComparisonsAt(
			indexWith({
				comparisons: [
					{
						...savedComparison(DIGEST),
						details: [
							{
								caseId: "audit-log",
								changedPaths: ["skills/review/SKILL.md"],
								corpusVersions: versions,
							},
						],
					},
					{
						...savedComparison(OTHER_DIGEST),
						details: [
							{
								caseId: "audit-log",
								changedPaths: ["skills/build/SKILL.md"],
								corpusVersions: {
									...versions,
									candidate: { state: "available", digest: "d".repeat(64) },
								},
							},
						],
					},
				],
			}),
		);

		const first = await screen.findByRole("listitem", {
			name: /audit-log.*511cd2c4442b/u,
		});
		const second = screen.getByRole("listitem", {
			name: /audit-log.*7e0f9a31c2d8/u,
		});
		expect(
			within(
				within(first).getByRole("list", { name: "Changed instructions" }),
			).getByText("skills/review/SKILL.md"),
		).toBeVisible();
		expect(
			within(second).getByRole("list", { name: "Changed instructions" }),
		).toHaveTextContent("skills/build/SKILL.md");
		const setup = within(first).getByRole("region", {
			name: "Setup for audit-log",
			hidden: true,
		});
		expect(setup).not.toBeVisible();

		fireEvent.click(within(first).getByText("Setup & record"));

		expect(setup).toBeVisible();
		expect(
			within(setup)
				.getAllByRole("term")
				.map((term) => [
					term.textContent,
					term.nextElementSibling?.textContent,
				]),
		).toEqual([
			["baseline", "corpus@aaaaaa"],
			["candidate", "corpus@bbbbbb"],
			["control", "corpus@cccccc"],
		]);

		fireEvent.click(within(second).getByText("Setup & record"));

		const otherSetup = within(second).getByRole("region", {
			name: "Setup for audit-log",
		});
		expect(
			within(otherSetup)
				.getAllByRole("term")
				.map((term) => [
					term.textContent,
					term.nextElementSibling?.textContent,
				]),
		).toEqual([
			["baseline", "corpus@aaaaaa"],
			["candidate", "corpus@dddddd"],
			["control", "corpus@cccccc"],
		]);
		expect(
			within(first).getByText("Comparison time not recorded"),
		).toBeVisible();
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

		const row = await screen.findByRole("listitem", {
			name: /audit-log.*511cd2c4442b/u,
		});

		expect(within(row).getByRole("heading", { level: 2 })).toHaveTextContent(
			"audit-log, brief-reply",
		);
		expect(within(row).getByText("511cd2c4442b")).toBeVisible();
		expect(within(row).getByText("pipeline")).toBeVisible();
		expect(within(row).getByText("5 requested per arm")).toBeVisible();
		expect(within(row).getByText(DIGEST)).not.toBeVisible();

		fireEvent.click(within(row).getByText("Setup & record"));

		expect(within(row).getByText(DIGEST)).toBeVisible();
		expect(within(row).getByText("Comparison time not recorded")).toBeVisible();
	});

	it.each([
		{ entry: "case link", name: /audit-log.*7e0f9a31c2d8/u },
		{ entry: "Open action", name: "Open comparison" },
	])("opens the chosen comparison through its $entry", async ({ name }) => {
		renderAppWithStub(
			"/comparisons",
			new Map<string, unknown>([
				[
					"/api/comparisons",
					indexWith({
						comparisons: [
							savedComparison(DIGEST),
							savedComparison(OTHER_DIGEST),
						],
					}),
				],
				[
					`/api/comparisons/${OTHER_DIGEST}`,
					{
						report: { mode: "session", cases: [] },
						checkpoint: { state: "unavailable", reasons: ["no checkpoint"] },
						corpusVersions: {},
						armFigures: {},
						attribution: {},
						summary: {},
						baselineArm: { kind: "supplied" },
					},
				],
			]),
		);

		const chosen = await screen.findByRole("listitem", {
			name: /audit-log.*7e0f9a31c2d8/u,
		});
		const open = within(chosen).getByRole("link", { name });
		expect(open).toHaveAttribute("href", `/comparisons/${OTHER_DIGEST}`);

		fireEvent.click(open);

		expect(
			await screen.findByRole("heading", {
				level: 1,
				name: /^Comparison · session/u,
			}),
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
