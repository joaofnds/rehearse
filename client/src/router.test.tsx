import { afterEach, describe, expect, it } from "bun:test";

import { screen, waitFor } from "@testing-library/react";

import type { CorpusResponse } from "#client/corpus/corpus-query";
import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";
import { renderAppWithStub } from "#client/test-support/render-app";

import { originalFetch } from "./route-test-fixtures";
import createAppRouter from "./router";

afterEach(() => {
	globalThis.fetch = originalFetch;
});
describe(createAppRouter.name, () => {
	it(
		"opens the aggregate group workspace at a saved group address",
		opensTheAggregateGroupWorkspaceAtASavedGroupAddress,
	);

	it(
		"renders run history at the root path, the landing screen",
		rendersRunHistoryAtTheRootPathTheLandingScreen,
	);

	it("renders the corpus screen at /corpus", rendersTheCorpusScreenAtCorpus);

	it(
		"renders the comparison screen at /comparisons/$digest",
		rendersTheComparisonScreenAtComparisonsDigest,
	);
});

async function opensTheAggregateGroupWorkspaceAtASavedGroupAddress(): Promise<void> {
	renderAppWithStub(
		"/groups/missing-group",
		new Map([["/api/runs", { launches: [], rows: [], unreadable: [] }]]),
	);
	expect(await screen.findByRole("alert")).toHaveTextContent(
		"No saved group missing-group was found.",
	);
}

async function rendersRunHistoryAtTheRootPathTheLandingScreen(): Promise<void> {
	renderAppWithStub(
		"/",
		new Map<string, unknown>([
			["/api/runs", { launches: [], rows: [], unreadable: [] }],
		]),
	);

	await waitFor(() => {
		expect(screen.getByRole("heading", { name: "Runs" })).toBeInTheDocument();
	});
}

async function rendersTheCorpusScreenAtCorpus(): Promise<void> {
	renderAppWithStub(
		"/corpus",
		new Map([
			[
				"/api/corpus",
				{
					digest: "a",
					files: [],
					lastEdit: { kind: "not-recorded", reason: "no earlier version" },
					refusals: [],
					root: "/corpus",
				} satisfies CorpusResponse,
			],
		]),
	);

	await waitFor(() => {
		expect(screen.getByText("Instruction corpus")).toBeInTheDocument();
	});
}

async function rendersTheComparisonScreenAtComparisonsDigest(): Promise<void> {
	const digest = "e".repeat(SHA256_HEX_CHARACTERS);
	renderAppWithStub(
		`/comparisons/${digest}`,
		new Map([
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

	expect(
		await screen.findByRole("heading", {
			level: 1,
			name: /^Comparison · session/u,
		}),
	).toBeInTheDocument();
}
