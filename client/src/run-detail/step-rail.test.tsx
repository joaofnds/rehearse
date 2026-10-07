import { afterEach, describe, expect, it } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { RunRecord, RunRecordStage } from "#server/run-record";
import { RUN, renderRunDetail, stoppedAtBuild } from "./run-detail-fixtures";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

/** The stopped run with shape's checkpoint, wall time and cost recorded. */
function stoppedWithFigures(): RunRecord {
	const record = stoppedAtBuild();
	const figures: Partial<RunRecordStage> = {
		checkpointShortId: { state: "available", shortId: "c-0147-1" },
		wallTime: { state: "available", ms: 242_000 },
		sessionCost: { state: "available", usd: 1.02 },
		judgeCost: { state: "available", usd: 0.1 },
	};

	const [first, ...later] = record.stages;

	return {
		...record,
		stages: first === undefined ? [] : [{ ...first, ...figures }, ...later],
	};
}

async function stepButtons(): Promise<readonly HTMLElement[]> {
	const steps = await screen.findByRole("region", { name: "Steps" });

	return within(
		within(steps).getByRole("list", { name: "Steps and checkpoints" }),
	).getAllByRole("button");
}

describe("Step rail", () => {
	it("lists every stage in order with its number, name, grade, status, checkpoint, wall time and cost", async () => {
		renderRunDetail(new Map([[`/api/runs/${RUN}`, stoppedWithFigures()]]));

		const [first, second, third] = await stepButtons();

		expect(first).toHaveTextContent(
			/^01shapeA✓acceptedc-0147-1 · 4m02s · \$1\.12$/u,
		);
		expect(second).toHaveTextContent(/^02buildD◼stopped/u);
		expect(third).toHaveTextContent(/^03verify.*○never ran$/u);
	});

	it("marks the selected stage as the current step", async () => {
		renderRunDetail();

		const buttons = await stepButtons();

		expect(
			buttons.map((button) => button.getAttribute("aria-current")),
		).toEqual([null, "step", null]);
	});

	it("shows the report of the stage chosen and writes it to the URL", async () => {
		const router = renderRunDetail();
		await stepButtons();

		fireEvent.click(screen.getByRole("button", { name: /^shape/u }));

		expect(
			await screen.findByRole("heading", { level: 2, name: "Step 1 · shape" }),
		).toBeInTheDocument();
		await waitFor(() => {
			expect(router.state.location.search).toEqual({ step: "shape" });
		});
	});
});
