import { afterEach, describe, expect, it } from "bun:test";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { stubFetchByPath } from "#client/test-support/fetch-stub";
import type { AttemptEvidenceResponse } from "./attempt-evidence-query";
import {
	AttemptEvidence,
	SavedOutput,
	ScorecardEvidence,
} from "./attempt-evidence";

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});
function showSession(
	record: Extract<AttemptEvidenceResponse, { kind: "session" }>["record"],
): void {
	stubFetchByPath(
		new Map([
			[
				"/api/attempt-evidence/attempt%3Asession%3Acase-a%2Fa",
				{ state: "available", kind: "session", record },
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
	grade: "C",
	verdict: "STOP",
	summary: "The public response is incomplete.",
	detailed: true,
	hardBlockers: [],
	requirements: [
		{
			id: "response",
			status: "FAIL",
			evidence: [
				{
					source: "artifact",
					path: "delivery.md",
					claim: "The response has no hasMore.",
					quote: "Return {items: []}",
					place: "delivery.md:1",
				},
			],
		},
	],
	dimensions: [],
} as const;
describe("saved attempt evidence", () => {
	it("shows the recorded reply beside failed and passed checks with their explanations", async () => {
		showSession({
			caseId: "case-a",
			outcome: "UNSUCCESSFUL",
			reply: "The saved answer has three words.",
			checks: [
				{
					kind: "word-band",
					status: "FAIL",
					detail: "6 words exceeds the ceiling of 3.",
				},
				{
					kind: "tool-calls",
					status: "PASS",
					detail: "No forbidden tools were called.",
				},
			],
		});
		expect(
			await screen.findByText("The saved answer has three words."),
		).toBeInTheDocument();
		expect(screen.getByText("FAIL · word-band")).toBeInTheDocument();
		expect(
			screen.getByText("6 words exceeds the ceiling of 3."),
		).toBeInTheDocument();
		expect(screen.getByText("PASS · tool-calls")).toBeInTheDocument();
		expect(screen.queryByText("Step Judge assessment")).not.toBeInTheDocument();
	});
	it("does not call absent checks failures when a session produced no reply", async () => {
		showSession({ caseId: "case-a", outcome: "NO_REPLY", checks: [] });
		expect(
			await screen.findByText(/no reply; no reply checks were evaluated/u),
		).toBeInTheDocument();
		expect(
			screen.getByText(/No check outcomes were recorded/u),
		).toBeInTheDocument();
		expect(screen.queryByText(/^FAIL/u)).not.toBeInTheDocument();
	});
	it("keeps a scorer failure separate from state check failures", async () => {
		showSession({
			caseId: "case-a",
			outcome: "SUCCESSFUL",
			reply: "done",
			checks: [{ kind: "word-band", status: "PASS", detail: "One word." }],
			stateGradingError: "Scorer did not exit successfully",
		});
		expect(
			await screen.findByText(
				"State checks unavailable: Scorer did not exit successfully",
			),
		).toBeInTheDocument();
		expect(screen.queryByText(/^FAIL/u)).not.toBeInTheDocument();
	});
	it("renders projected worker output alongside one assessment and its exact citations", () => {
		render(
			<ScorecardEvidence
				record={{
					state: "available",
					kind: "stage",
					stage: "build",
					output: {
						state: "available",
						kind: "artifact",
						path: "delivery.md",
						text: "Return {items: []}",
					},
					assessment: grade,
				}}
			/>,
		);
		expect(
			screen.getByRole("region", { name: "delivery.md" }),
		).toHaveTextContent("Return {items: []}");
		expect(
			screen.getAllByRole("heading", { name: "Step Judge assessment" }),
		).toHaveLength(1);
		expect(
			screen.getByText("The response has no hasMore."),
		).toBeInTheDocument();
		expect(screen.getByText(/delivery.md:1/u)).toBeInTheDocument();
	});
	it("labels summary-only legacy grades and missing output explicitly", () => {
		render(
			<ScorecardEvidence
				record={{
					state: "available",
					kind: "stage",
					stage: "build",
					output: { state: "unavailable", reason: "Output was not retained." },
					assessment: {
						grade: "B",
						verdict: "CONTINUE",
						detailed: false,
						hardBlockers: [],
						requirements: [],
						dimensions: [],
					},
				}}
			/>,
		);
		expect(
			screen.getByText("Output unavailable in this saved record."),
		).toBeInTheDocument();
		expect(screen.getByText(/summary grade only/u)).toBeInTheDocument();
	});
	it("renders a retained delivery diff separately from the completed reply", () => {
		render(
			<ScorecardEvidence
				record={{
					state: "available",
					kind: "stage",
					stage: "build",
					output: {
						state: "available",
						kind: "reply",
						text: "The actual completed reply.",
					},
					diff: "The separate saved diff.",
					assessment: grade,
				}}
			/>,
		);
		expect(
			screen.getByRole("region", { name: "Saved completion reply" }),
		).toHaveTextContent("The actual completed reply.");
		expect(
			screen.getByText("Saved delivery diff", { selector: "summary" }),
		).toBeInTheDocument();
	});
	it("opens the complete saved output as literal text and closes it", async () => {
		const text = `<script>bad()</script>\n${"saved line\n".repeat(100)}`;
		render(<SavedOutput title="Reply" text={text} />);
		fireEvent.click(
			screen.getByRole("button", { name: "Open complete output" }),
		);
		const dialog = await screen.findByRole("dialog");
		expect(dialog.querySelector("pre")?.textContent).toBe(text);
		expect(dialog.querySelector("script")).toBeNull();
		fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});
});
