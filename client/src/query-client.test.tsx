import { afterEach, describe, expect, it } from "bun:test";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { ComparisonPage } from "#client/comparison/comparison-page";
import { EvidenceSourcePage } from "#client/evidence/evidence-source-page";
import { createQueryClient } from "#client/query-client";

const DIGEST = "0".repeat(64);

describe(createQueryClient.name, () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("shows the empty state on the first answer, without retrying a record that is not there", async () => {
		let calls = 0;
		const stub = (): Promise<Response> => {
			calls += 1;

			return Promise.resolve(
				Response.json({ error: "not found" }, { status: 404 }),
			);
		};
		stub.preconnect = originalFetch.preconnect;
		globalThis.fetch = stub;

		render(
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
		expect(calls).toBe(1);
	});

	it.each([404, 400])(
		"says an evidence item cannot be opened on the first %d answer, without retrying it",
		async (status) => {
			let calls = 0;
			const stub = (): Promise<Response> => {
				calls += 1;

				return Promise.resolve(
					Response.json({ error: "no such item" }, { status }),
				);
			};
			stub.preconnect = originalFetch.preconnect;
			globalThis.fetch = stub;

			render(
				<QueryClientProvider client={createQueryClient()}>
					<EvidenceSourcePage
						identity={{ kind: "final", run: "run", item: "tests", index: "0" }}
					/>
				</QueryClientProvider>,
			);

			expect(await screen.findByRole("alert")).toHaveTextContent(
				"Could not open this evidence item.",
			);
			expect(calls).toBe(1);
		},
	);
});
