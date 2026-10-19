import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, waitFor } from "@testing-library/react";

import type { CorpusResponse } from "#client/corpus/corpus-query";
import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";
import { stubFetchByPath } from "#client/test-support/fetch-stub";
import { renderAppAt } from "#client/test-support/render-app";

import { originalFetch, renderShellAt } from "./shell-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("the navigation shell", () => {
	it(
		"navigates between run history and corpus by click",
		navigatesBetweenRunHistoryAndCorpusByClick,
	);

	it(
		"marks the open screen's own section as the current page",
		marksTheOpenScreenSOwnSectionAsTheCurrentPage,
	);

	it.each([
		"/comparisons",
		`/comparisons/${"e".repeat(SHA256_HEX_CHARACTERS)}`,
	])("marks comparisons as the current section on %s", marksComparisonSection);

	it(
		"opens a recorded run from Runs and keeps Runs current",
		opensARecordedRunFromRunsAndKeepsRunsCurrent,
	);

	it.each([
		"/",
		"/corpus",
		"/system",
		"/runs/run-a/stages/build",
		"/tasks",
		"/no-such-screen",
	])("gives %s one main landmark, the shell's own", givesShellMainLandmark);

	it(
		"gives the comparison screen one main landmark too",
		givesTheComparisonScreenOneMainLandmarkToo,
	);
});

async function navigatesBetweenRunHistoryAndCorpusByClick(): Promise<void> {
	renderShellAt("/");

	await waitFor(() => {
		expect(screen.getByRole("heading", { name: "Runs" })).toBeInTheDocument();
	});

	fireEvent.click(screen.getByRole("link", { name: /Corpus/u }));

	await waitFor(() => {
		expect(
			screen.getByRole("heading", { name: "Instruction corpus" }),
		).toBeInTheDocument();
	});

	fireEvent.click(screen.getByRole("link", { name: /Runs/u }));

	await waitFor(() => {
		expect(screen.getByRole("heading", { name: "Runs" })).toBeInTheDocument();
	});
}

async function marksTheOpenScreenSOwnSectionAsTheCurrentPage(): Promise<void> {
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
	expect(screen.getByRole("link", { name: /Runs/u })).not.toHaveAttribute(
		"aria-current",
	);
}

async function opensARecordedRunFromRunsAndKeepsRunsCurrent(): Promise<void> {
	const router = renderShellAt("/", {
		corpusFiles: 0,
		runs: 2,
		sessionAttempts: 1,
	});

	fireEvent.click(
		await screen.findByRole("link", {
			name: "2026-09-06T21-58-29.500Z",
		}),
	);

	await waitFor(() => {
		expect(router.state.location.pathname).toBe(
			"/runs/2026-09-06T21-58-29.500Z",
		);
	});
	expect(screen.getByRole("link", { name: /^Runs/u })).toHaveAttribute(
		"aria-current",
		"page",
	);
}

async function givesTheComparisonScreenOneMainLandmarkToo(): Promise<void> {
	const digest = "e".repeat(SHA256_HEX_CHARACTERS);
	stubFetchByPath(
		new Map<string, unknown>([
			["/api/run-listing", { launches: [], rows: [], unreadable: [] }],
			[
				"/api/corpus-summary",
				{
					digest: "ffd58d",
					files: [],
					lastEdit: { kind: "not-recorded", reason: "no earlier version" },
					refusals: [],
					root: "/corpus",
				} satisfies CorpusResponse,
			],
			[
				`/api/comparisons/${digest}`,
				{
					armFigures: {},
					attribution: {},
					baselineArm: { kind: "supplied" },
					checkpoint: { reasons: ["no checkpoint"], state: "unavailable" },
					corpusVersions: {},
					report: { cases: [], mode: "session" },
					summary: {},
				},
			],
		]),
	);
	renderAppAt(`/comparisons/${digest}`);

	await screen.findByRole("navigation", { name: "Sections" });

	await waitFor(() => {
		const expectedMainCount = 1;

		expect(screen.getAllByRole("main")).toHaveLength(expectedMainCount);
	});
}

async function marksComparisonSection(path: string): Promise<void> {
	renderShellAt(path);

	await screen.findByRole("navigation", { name: "Sections" });

	expect(screen.getByRole("link", { name: /^Comparisons/u })).toHaveAttribute(
		"aria-current",
		"page",
	);
	expect(screen.getByRole("link", { name: /Runs/u })).not.toHaveAttribute(
		"aria-current",
	);
}

async function givesShellMainLandmark(path: string): Promise<void> {
	renderShellAt(path, { corpusFiles: 137, runs: 0 });

	await screen.findByRole("navigation", { name: "Sections" });

	await waitFor(() => {
		const expectedMainCount = 1;

		expect(screen.getAllByRole("main")).toHaveLength(expectedMainCount);
	});
}
