import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";

import { stubFetchByPath } from "#client/test-support/fetch-stub";

import { AttemptEvidence } from "./attempt-evidence";
import type { AttemptEvidenceResponse } from "./attempt-evidence-query";

const originalFetch = globalThis.fetch;

function showSession(
	record: Extract<AttemptEvidenceResponse, { kind: "session" }>["record"],
): void {
	stubFetchByPath(
		new Map([
			[
				"/api/attempt-evidence/attempt%3Asession%3Acase-a%2Fa",
				{ kind: "session", record, state: "available" },
			],
		]),
	);
	render(
		<QueryClientProvider
			client={
				new QueryClient({ defaultOptions: { queries: { retry: false } } })
			}
		>
			<AttemptEvidence id="attempt:session:case-a/a" />
		</QueryClientProvider>,
	);
}

const grade = {
	detailed: true,
	dimensions: [],
	grade: "C",
	hardBlockers: [],
	requirements: [
		{
			evidence: [
				{
					claim: "The response has no hasMore.",
					path: "delivery.md",
					place: "delivery.md:1",
					quote: "Return {items: []}",
					source: "artifact",
				},
			],
			id: "response",
			status: "FAIL",
		},
	],
	summary: "The public response is incomplete.",
	verdict: "STOP",
} as const;

export { grade, originalFetch, showSession };
