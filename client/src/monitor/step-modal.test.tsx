import { afterEach, describe, expect, it } from "bun:test";
import { fireEvent, screen, within } from "@testing-library/react";
import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import { renderAppWithStub } from "#client/test-support/render-app";
import { recordStage, runRecord } from "#client/test-support/run-record";
import { runRow } from "#client/test-support/runs-in-flight";

const RUN = "2026-09-30T10-00-00.000Z";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

type RunRecordStage = ReturnType<typeof recordStage>;

function history(): RunHistoryResponse {
	return {
		rows: [runRow({ run: RUN, stage: "build" })],
		launches: [],
		unreadable: [],
	};
}

/** The monitor on one run in flight at build, with the stages and extra bodies given. */
function renderMonitor(
	stages: readonly RunRecordStage[],
	extra: ReadonlyMap<string, unknown> = new Map(),
): void {
	renderAppWithStub(
		"/monitor",
		new Map<string, unknown>([
			["/api/runs", history()],
			[`/api/runs/${RUN}`, runRecord({ run: RUN, running: "build", stages })],
			...extra,
		]),
	);
}

/** The task graph's node for a stage. */
async function graphNode(stage: string): Promise<HTMLElement> {
	const graph = await screen.findByRole("region", { name: "Task graph" });
	const shown = within(graph)
		.getAllByRole("listitem")
		.find((item) => within(item).queryByText(stage) !== null);
	if (shown === undefined) {
		throw new Error(`the graph draws no node for ${stage}`);
	}

	return shown;
}

async function inOutAction(stage: string): Promise<HTMLElement> {
	return within(await graphNode(stage)).getByRole("button", {
		name: `${stage} — instructions in, artifacts out`,
	});
}

describe("/monitor step modal", () => {
	it("offers each node's in / out action above its replay", async () => {
		renderMonitor([
			recordStage("plan", { status: "graded" }),
			recordStage("build"),
		]);

		const node = await graphNode("plan");
		const actions = within(node)
			.getAllByRole("button")
			.filter(({ textContent }) => /in \/ out|replay/u.test(textContent));

		expect(actions.map(({ textContent }) => textContent)).toEqual([
			"in / out ▸",
			"replay",
		]);
	});

	it("opens the stage's step modal from its in / out action", async () => {
		renderMonitor([
			recordStage("plan", { status: "graded" }),
			recordStage("build"),
		]);

		fireEvent.click(await inOutAction("plan"));

		expect(
			await screen.findByRole("dialog", { name: /plan/u }),
		).toHaveAttribute("aria-modal", "true");
	});
});
