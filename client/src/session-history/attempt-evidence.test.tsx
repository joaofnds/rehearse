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
	it("opens a cached diff in Raw when replacing a formatted output", () => {
		const { rerender, container } = render(
			<SavedOutput title="Output" text="# Artifact" />,
		);
		expect(screen.getByRole("heading", { name: "Artifact" })).toBeVisible();

		rerender(
			<SavedOutput
				title="Output"
				text={"-  removed\n+  added"}
				initialMode="Raw"
			/>,
		);

		expect(
			screen.getByRole("button", { name: "Raw", pressed: true }),
		).toBeVisible();
		expect(container.querySelector("pre")?.textContent).toBe(
			"-  removed\n+  added",
		);
	});

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
	it("distinguishes a successful recorded result from failed saved state checks and orders failures first", async () => {
		showSession({
			caseId: "case-a",
			outcome: "SUCCESSFUL",
			reply: "done",
			checks: [{ kind: "tool-calls", status: "PASS", detail: "Allowed tool." }],
			stateResults: [
				{ name: "retained", status: "PASS", detail: "Retained state." },
				{
					name: "history-preserved",
					status: "FAIL",
					detail: "History was removed.",
				},
			],
		});

		expect(
			await screen.findByText("Recorded outcome: SUCCESSFUL"),
		).toBeInTheDocument();
		expect(
			screen.getByText("1 of 1 reply/transcript checks passed"),
		).toBeInTheDocument();
		expect(
			screen.getByText("1 of 2 saved state checks passed"),
		).toBeInTheDocument();
		expect(
			screen.getByText(/Recorded success and saved state checks disagree/u),
		).toBeInTheDocument();
		const checks = within(
			screen.getByRole("list", { name: "Saved state checks" }),
		).getAllByRole("listitem");
		expect(checks[0]).toHaveTextContent("FAIL · history-preserved");
		const passed = screen.getByText("Saved state checks: 1 passed", {
			selector: "summary",
		});
		expect(passed.parentElement).not.toHaveAttribute("open");
		fireEvent.click(passed);
		expect(screen.getByText("Retained state.")).toBeInTheDocument();
		expect(
			screen.getByText("Reply/transcript checks: 1 passed", {
				selector: "summary",
			}).parentElement,
		).not.toHaveAttribute("open");
	});
	it("distinguishes a recorded unsuccessful result from fully passing saved state checks", async () => {
		showSession({
			caseId: "case-a",
			outcome: "UNSUCCESSFUL",
			reply: "done",
			checks: [
				{ kind: "word-band", status: "FAIL", detail: "Reply was too short." },
			],
			stateResults: [
				{ name: "retained", status: "PASS", detail: "Saved state retained." },
			],
		});

		expect(
			await screen.findByText(
				"Recorded unsuccessful outcome and saved state checks differ: all saved state checks passed.",
			),
		).toBeInTheDocument();
		expect(
			screen.getByText("Recorded outcome: UNSUCCESSFUL"),
		).toBeInTheDocument();
		expect(
			screen.getByText("0 of 1 reply/transcript checks passed"),
		).toBeInTheDocument();
		expect(
			screen.getByText("1 of 1 saved state checks passed"),
		).toBeInTheDocument();
	});

	it.each(["NO_REPLY", "EXECUTION_FAILED"] as const)(
		"keeps %s separate from a check assessment disagreement",
		async (outcome) => {
			showSession({
				caseId: "case-a",
				outcome,
				checks: [],
				stateResults: [
					{ name: "retained", status: "PASS", detail: "Saved state retained." },
				],
			});

			expect(
				await screen.findByText(`Recorded outcome: ${outcome}`),
			).toBeInTheDocument();
			expect(
				screen.queryByText(
					/Recorded unsuccessful outcome and saved state checks differ/u,
				),
			).not.toBeInTheDocument();
		},
	);

	it("keeps an incomplete state assessment unavailable rather than claiming an inverse disagreement", async () => {
		showSession({
			caseId: "case-a",
			outcome: "UNSUCCESSFUL",
			checks: [],
			stateResults: [
				{ name: "retained", status: "PASS", detail: "Saved state retained." },
			],
			stateGradingError: "Remaining state checks unavailable",
		});

		expect(
			await screen.findByText(
				"State checks unavailable: Remaining state checks unavailable",
			),
		).toBeInTheDocument();
		expect(
			screen.queryByText(
				/Recorded unsuccessful outcome and saved state checks differ/u,
			),
		).not.toBeInTheDocument();
	});
	it("switches a formatted reading back to the exact saved source", () => {
		const text =
			"# Saved heading\n\n- one\n- two\n\n```ts\nconst value = 1;\n```\n";
		render(<SavedOutput title="Reply" text={text} />);

		expect(
			screen.getByRole("heading", { name: "Saved heading" }),
		).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Raw" }));

		expect(
			screen.getByRole("region", { name: "Reply" }).querySelector("pre")
				?.textContent,
		).toBe(text);
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
	it("keeps clear blockers and their citations in a disclosure after failed findings", () => {
		render(
			<ScorecardEvidence
				record={{
					state: "available",
					kind: "stage",
					stage: "build",
					output: { state: "unavailable", reason: "No output retained." },
					assessment: {
						...grade,
						hardBlockers: [
							{
								id: "no-secrets",
								status: "PASS",
								evidence: [
									{
										source: "artifact",
										path: "delivery.md",
										claim: "No secret material.",
										quote: "checked",
									},
								],
							},
						],
					},
				}}
			/>,
		);

		const clear = screen.getByText("1 clear blocker & citations", {
			selector: "summary",
		});
		expect(clear.parentElement).not.toHaveAttribute("open");
		fireEvent.click(clear);

		expect(screen.getByText("No secret material.")).toBeInTheDocument();
		expect(screen.getByText("checked")).toBeInTheDocument();
		expect(
			screen.getByText("FAIL · Requirement · response"),
		).toBeInTheDocument();
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
