import { afterEach, describe, expect, it } from "bun:test";
import { screen, within } from "@testing-library/react";
import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import { renderAppWithStub } from "#client/test-support/render-app";
import { recordStage, runRecord } from "#client/test-support/run-record";
import { graded, notYet, runRow } from "#client/test-support/runs-in-flight";

type HistoryRow = RunHistoryResponse["rows"][number];

const RUN = "2026-09-30T10-00-00.000Z";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function history(rows: readonly HistoryRow[]): RunHistoryResponse {
	return { rows: [...rows], launches: [], unreadable: [] };
}

describe("/monitor", () => {
	it("lists the run's stages in pipeline order with the running one marked", async () => {
		renderAppWithStub(
			"/monitor",
			new Map<string, unknown>([
				[
					"/api/runs",
					history([
						runRow({
							run: RUN,
							stage: "build",
							grades: [graded("plan", "B+"), notYet("build"), notYet("review")],
						}),
					]),
				],
				[
					`/api/runs/${RUN}`,
					runRecord({
						run: RUN,
						running: "build",
						stages: [
							recordStage("plan", { status: "graded" }),
							recordStage("build"),
							recordStage("review"),
						],
					}),
				],
			]),
		);

		const graph = await screen.findByRole("region", { name: "Task graph" });
		const nodes = within(graph).getAllByRole("listitem");
		expect(
			nodes.map(
				(node) =>
					within(node).getByText(/^(?:plan|build|review)$/u).textContent,
			),
		).toEqual(["plan", "build", "review"]);
		expect(
			nodes.map(
				(node) =>
					within(node).getByText(/accepted|running|queued/u).textContent,
			),
		).toEqual(["✓accepted", "●session running", "○queued"]);
	});
});
