import { afterEach, describe, expect, it } from "bun:test";

import { QueryClientProvider } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";

import { ComparisonPage } from "#client/comparison/comparison-page";
import EvidenceSourcePage from "#client/evidence/evidence-source-page";
import createQueryClient from "#client/query-client";
import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";
import { renderWithRouter } from "#client/test-support/render-app";

const CALL_COUNT_INCREMENT = 1;

const DIGEST = "0".repeat(SHA256_HEX_CHARACTERS);

const originalFetch = globalThis.fetch;
describe(createQueryClient.name, () => {
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it(
		"shows the empty state on the first answer, without retrying a record that is not there",
		doesNotRetryMissingComparison,
	);

	it.each([{ status: 404 }, { status: 400 }])(
		"says an evidence item cannot be opened on the first %d answer, without retrying it",
		refusesEvidenceOnFirstAnswer,
	);
});

async function refusesEvidenceOnFirstAnswer({
	status,
}: EvidenceRefusal): Promise<void> {
	const expectedCalls = 1;

	let calls = 0;
	const stub = async (): Promise<Response> => {
		calls += CALL_COUNT_INCREMENT;

		return await Promise.resolve(
			Response.json({ error: "no such item" }, { status }),
		);
	};
	stub.preconnect = originalFetch.preconnect;
	globalThis.fetch = stub;

	renderWithRouter(
		<QueryClientProvider client={createQueryClient()}>
			<EvidenceSourcePage
				identity={{ index: "0", item: "tests", kind: "final", run: "run" }}
			/>
		</QueryClientProvider>,
	);

	expect(await screen.findByRole("alert")).toHaveTextContent(
		"Could not open this evidence item.",
	);
	expect(calls).toBe(expectedCalls);
}

interface EvidenceRefusal {
	readonly status: number;
}

async function doesNotRetryMissingComparison(): Promise<void> {
	const expectedCalls = 1;

	let calls = 0;
	const stub = async (): Promise<Response> => {
		calls += CALL_COUNT_INCREMENT;

		return await Promise.resolve(
			Response.json({ error: "not found" }, { status: 404 }),
		);
	};
	stub.preconnect = originalFetch.preconnect;
	globalThis.fetch = stub;

	renderWithRouter(
		<QueryClientProvider client={createQueryClient()}>
			<ComparisonPage digest={DIGEST} />
		</QueryClientProvider>,
	);

	await waitFor(
		() => {
			expect(screen.getByText("No comparison recorded")).toBeInTheDocument();
		},
		{ timeout: 5000 },
	);
	expect(calls).toBe(expectedCalls);
}
