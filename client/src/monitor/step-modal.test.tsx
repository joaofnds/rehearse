import { afterEach, describe, expect, it } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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

const SKILL_PATH = ".agents/skills/plan/SKILL.md";

/** A graded stage with every figure its header reads. */
const FINISHED_PLAN = {
	status: "graded",
	grade: {
		state: "available",
		letter: "B+",
		verdict: "CONTINUE",
		reachesMinimum: true,
	},
	wallTime: { state: "available", ms: 242_000 },
	sessionCost: { state: "available", usd: 1.12 },
	judgeCost: { state: "available", usd: 0.22 },
	checkpoint: "recorded",
	readManifest: {
		state: "available",
		entries: [
			{
				path: SKILL_PATH,
				half: "corpus",
				role: "stage skill",
				evidence: "declared",
				sha256: "88b0d2".padEnd(64, "0"),
				state: "unchanged",
			},
		],
	},
} as const satisfies Partial<RunRecordStage>;

async function openModal(stage: string): Promise<HTMLElement> {
	fireEvent.click(await inOutAction(stage));

	return screen.findByRole("dialog", { name: new RegExp(stage, "u") });
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

	it("closes on its Esc button and returns focus to the in / out action", async () => {
		renderMonitor([
			recordStage("plan", { status: "graded" }),
			recordStage("build"),
		]);
		const action = await inOutAction("plan");
		fireEvent.click(action);
		const dialog = await screen.findByRole("dialog", { name: /plan/u });

		fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));

		await waitFor(() => {
			expect(screen.queryByRole("dialog")).toBeNull();
		});
		expect(action).toHaveFocus();
	});

	it("closes on the Esc key and returns focus to the in / out action", async () => {
		renderMonitor([
			recordStage("plan", { status: "graded" }),
			recordStage("build"),
		]);
		const action = await inOutAction("plan");
		fireEvent.click(action);
		const dialog = await screen.findByRole("dialog", { name: /plan/u });

		fireEvent.keyDown(dialog, { key: "Escape" });

		await waitFor(() => {
			expect(screen.queryByRole("dialog")).toBeNull();
		});
		expect(action).toHaveFocus();
	});

	it("keeps focus inside while open", async () => {
		renderMonitor([
			recordStage("plan", { status: "graded" }),
			recordStage("build"),
		]);
		fireEvent.click(await inOutAction("plan"));

		const dialog = await screen.findByRole("dialog", { name: /plan/u });

		await waitFor(() => {
			expect(dialog.contains(document.activeElement)).toBe(true);
		});
	});

	describe("its header", () => {
		it("shows the step's number, name, skill, wall time, cost, verdict and grade", async () => {
			renderMonitor([recordStage("plan", FINISHED_PLAN), recordStage("build")]);

			const dialog = await openModal("plan");

			expect(within(dialog).getByRole("banner")).toHaveTextContent(
				"Step 01plan.agents/skills/plan/SKILL.md · 4m02s · $1.34verdict accepted B+Esc",
			);
		});

		it("reads each figure a running step has not produced as pending", async () => {
			renderMonitor([recordStage("plan", FINISHED_PLAN), recordStage("build")]);

			const dialog = await openModal("build");

			expect(within(dialog).getByRole("banner")).toHaveTextContent(
				"Step 02buildskill pending · wall time pending · cost pendingverdict pending —Esc",
			);
		});

		it("reads each figure an ended step's record lacks as not recorded", async () => {
			renderMonitor([
				recordStage("plan", { status: "stopped" }),
				recordStage("build"),
			]);

			const dialog = await openModal("plan");

			expect(within(dialog).getByRole("banner")).toHaveTextContent(
				"skill not recorded: not read by this test · wall time not recorded: not read by this test · session cost not recorded: not read by this test · judge cost not recorded: not read by this test",
			);
		});
	});
});
