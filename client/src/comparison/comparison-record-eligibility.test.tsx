import { afterEach, describe, expect, it } from "bun:test";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import { renderWithRouter } from "#client/test-support/render-app";

import { ComparisonPage } from "./comparison-page";
import {
	DIGEST,
	comparisonResponseBody,
	missingComparisonResponse,
	originalFetch,
	renderPage,
} from "./comparison-page-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});
describe(ComparisonPage.name, () => {
	it(
		"renders the empty state, not a generic error, when no comparison is recorded for the digest",
		rendersTheEmptyStateNotAGenericErrorWhenNoComparisonIsRecordedForTheDigest,
	);

	it(
		"says no file explains a movement, never a false attribution, when baseline and candidate ran identical corpora",
		saysNoFileExplainsAMovementNeverAFalseAttributionWhenBaselineAndCandidateRanIdenticalCorpora,
	);

	it(
		"says why a comparison whose author supplied the control arm cannot take more attempts",
		saysWhyAComparisonWhoseAuthorSuppliedTheControlArmCannotTakeMoreAttempts,
	);
});

async function rendersTheEmptyStateNotAGenericErrorWhenNoComparisonIsRecordedForTheDigest(): Promise<void> {
	globalThis.fetch = Object.assign(missingComparisonResponse, {
		preconnect: fetch.preconnect,
	});
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	renderWithRouter(
		<QueryClientProvider client={client}>
			<ComparisonPage digest={DIGEST} />
		</QueryClientProvider>,
	);

	await waitFor(() => {
		expect(screen.getByText("No comparison recorded")).toBeInTheDocument();
	});
	expect(screen.queryByRole("alert")).not.toBeInTheDocument();
}

async function saysNoFileExplainsAMovementNeverAFalseAttributionWhenBaselineAndCandidateRanIdenticalCorpora(): Promise<void> {
	renderPage({
		...comparisonResponseBody(),
		attribution: {
			"case-1": { candidateMinusBaseline: { claim: "identical" } },
			"case-2": { candidateMinusBaseline: { claim: "identical" } },
		},
	});

	fireEvent.click(await screen.findByRole("button", { name: "What moved" }));

	expect(
		screen.getByRole("region", { name: "Attribution · case-1" }),
	).toHaveTextContent(
		"Baseline and candidate ran identical corpora, so no file explains a movement between them.",
	);
	expect(
		screen.queryByText(/attributable to that file/u),
	).not.toBeInTheDocument();
}

async function saysWhyAComparisonWhoseAuthorSuppliedTheControlArmCannotTakeMoreAttempts(): Promise<void> {
	renderPage();

	fireEvent.click(await screen.findByRole("button", { name: "Attempt pairs" }));

	const caseOne = await screen.findByRole("region", {
		name: "Attempt pairs · case-1",
	});

	expect(
		within(caseOne).getByText(
			/^More attempts cannot be added: this comparison was not made by compare attempts/u,
		),
	).toBeInTheDocument();
	expect(
		screen.queryByRole("button", { name: /attempts? to each arm/u }),
	).not.toBeInTheDocument();
}
