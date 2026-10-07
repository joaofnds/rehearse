import { afterEach, describe, expect, it } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { LiveReply } from "#client/test-support/live-reply";
import { runRow } from "#client/test-support/runs-in-flight";
import {
	ANALYSES,
	CORPUS,
	history,
	noAnalysis,
	RUN,
	recordedAnalysis,
	serveContribution,
	stoppedRow,
} from "./run-detail-fixtures";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function rootCauseSection(): Promise<HTMLElement> {
	return screen.findByRole("region", { name: "Root-cause analysis" });
}

describe("requesting a root-cause analysis", () => {
	it("says no analysis is recorded and states the most a request can spend before the click", async () => {
		serveContribution(new Map());

		const section = await rootCauseSection();

		expect(
			await within(section).findByText(
				"No root-cause analysis is recorded for this run.",
			),
		).toBeInTheDocument();
		expect(section).toHaveTextContent(
			"A request makes one sonnet call that can spend at most $1.00.",
		);
		expect(
			within(section).getByRole("button", {
				name: "Request a root-cause analysis · at most $1.00",
			}),
		).toBeEnabled();
	});

	it("posts the run and the stated cap, then reads the analyses again", async () => {
		const server = serveContribution(
			new Map([["POST /api/launches", { status: 201, body: { id: "l-1" } }]]),
		);

		fireEvent.click(
			await within(await rootCauseSection()).findByRole("button", {
				name: "Request a root-cause analysis · at most $1.00",
			}),
		);

		await waitFor(() => {
			expect(server.posted("/api/launches")).toHaveLength(1);
		});
		await waitFor(() => {
			expect(
				server.sent.filter(
					({ method, pathname }) => method === "GET" && pathname === ANALYSES,
				).length,
			).toBeGreaterThan(1);
		});
		expect(JSON.parse(server.posted("/api/launches")[0]?.body ?? "")).toEqual({
			kind: "analysis",
			run: RUN,
			statedUsd: 1,
		});
	});

	it("shows the server's refusal", async () => {
		serveContribution(
			new Map([
				[
					"POST /api/launches",
					{ status: 409, body: { error: "the run is still in flight" } },
				],
			]),
		);

		fireEvent.click(
			await within(await rootCauseSection()).findByRole("button", {
				name: "Request a root-cause analysis · at most $1.00",
			}),
		);

		expect(await screen.findByRole("alert")).toHaveTextContent(
			"the run is still in flight",
		);
	});

	it("refuses before the click when no spend limit allows a request", async () => {
		serveContribution(
			new Map([
				[
					`GET ${ANALYSES}`,
					{
						status: 200,
						body: noAnalysis({
							model: "sonnet",
							capUsd: null,
							refusal: "Set a spend limit before requesting an analysis.",
						}),
					},
				],
			]),
		);

		const section = await rootCauseSection();

		expect(
			await within(section).findByText(
				"Set a spend limit before requesting an analysis.",
			),
		).toBeInTheDocument();
		expect(
			within(section).getByRole("button", {
				name: /^Request a root-cause analysis/u,
			}),
		).toHaveAttribute("aria-disabled", "true");
	});

	it("refuses before the click while the run itself has not ended", async () => {
		serveContribution(
			new Map(),
			history([
				{
					...runRow({
						run: RUN,
						status: "RUNNING",
						corpusVersion: { kind: "version", digest: CORPUS },
					}),
					shortId: "r-0147",
				},
			]),
		);

		const section = await rootCauseSection();

		expect(
			await within(section).findByText(
				"An analysis reads an ended run, and this one has not ended.",
			),
		).toBeInTheDocument();
		expect(
			within(section).getByRole("button", {
				name: /^Request a root-cause analysis/u,
			}),
		).toHaveAttribute("aria-disabled", "true");
	});

	it("waits while an analysis of this run is in flight", async () => {
		serveContribution(new Map(), {
			...history([stoppedRow()]),
			launches: [
				{
					kind: "launch",
					id: "l-1",
					target: "analysis",
					caseId: undefined,
					run: RUN,
					stage: undefined,
					attempts: 1,
					launchedAt: "2026-09-28T10:50:00.000Z",
					status: "RUNNING",
				},
			],
		});

		const section = await rootCauseSection();

		expect(
			await within(section).findByText("An analysis of this run is in flight."),
		).toBeInTheDocument();
		expect(
			within(section).getByRole("button", {
				name: /^Request a root-cause analysis/u,
			}),
		).toHaveAttribute("aria-disabled", "true");
	});

	it("shows the analysis once the one in flight records it", async () => {
		let recorded = false;
		const running = {
			...history([stoppedRow()]),
			launches: [
				{
					kind: "launch",
					id: "l-1",
					target: "analysis",
					caseId: undefined,
					run: RUN,
					stage: undefined,
					attempts: 1,
					launchedAt: "2026-09-28T10:50:00.000Z",
					status: "RUNNING",
				} as const,
			],
		};
		serveContribution(
			new Map([
				[
					"GET /api/runs",
					new LiveReply(() => ({
						status: 200,
						body: recorded ? history([stoppedRow()]) : running,
					})),
				],
				[
					`GET ${ANALYSES}`,
					new LiveReply(() => ({
						status: 200,
						body: recorded ? recordedAnalysis() : noAnalysis(),
					})),
				],
			]),
		);

		await within(await rootCauseSection()).findByText(
			"An analysis of this run is in flight.",
		);
		recorded = true;

		expect(
			await within(await rootCauseSection()).findByText(
				"Build skipped the scope declaration the shape step asked for.",
				undefined,
				{ timeout: 5000 },
			),
		).toBeInTheDocument();
	});

	it("re-runs a recorded analysis at the cap a request may spend now, not the one it ran under", async () => {
		const server = serveContribution(
			new Map([
				[
					`GET ${ANALYSES}`,
					{
						status: 200,
						body: {
							...recordedAnalysis(),
							request: { model: "sonnet", capUsd: 2, refusal: null },
						},
					},
				],
				["POST /api/launches", { status: 201, body: { id: "l-1" } }],
			]),
		);

		fireEvent.click(
			await within(await rootCauseSection()).findByRole("button", {
				name: "Re-run the analysis · at most $2.00",
			}),
		);

		await waitFor(() => {
			expect(server.posted("/api/launches")).toHaveLength(1);
		});
		expect(JSON.parse(server.posted("/api/launches")[0]?.body ?? "")).toEqual({
			kind: "analysis",
			run: RUN,
			statedUsd: 2,
		});
	});
});
