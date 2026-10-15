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
			["/api/run-listing", history()],
			["/api/runs", history()],
			[`/api/runs/${RUN}`, runRecord({ run: RUN, running: "build", stages })],
			...extra,
		]),
	);
}

function renderEndedMonitor(stages: readonly RunRecordStage[]): void {
	const completed = {
		...runRecord({ run: RUN, running: "build", stages }),
		finalOutcome: { status: "JUDGED", verdict: "PASS" },
	};
	const completedHistory: RunHistoryResponse = {
		rows: [
			{
				...runRow({ run: RUN, status: "COMPLETED" }),
				replayableStages: stages.map(({ stage }) => stage),
			},
		],
		launches: [],
		unreadable: [],
	};
	renderAppWithStub(
		`/runs/${RUN}?view=activity`,
		new Map<string, unknown>([
			["/api/run-listing", completedHistory],
			["/api/runs", completedHistory],
			[`/api/runs/${RUN}`, completed],
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
	fireEvent.click(within(await graphNode(stage)).getByRole("button"));
	await waitFor(() => {
		expect(screen.getByText(/Selected step/u).parentElement).toHaveTextContent(
			stage,
		);
	});
	return screen.getByRole("button", { name: "Inputs & output" });
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
	it("keeps step actions in the selected-step toolbar", async () => {
		renderMonitor([
			recordStage("plan", { status: "graded" }),
			recordStage("build"),
		]);

		const node = await graphNode("plan");
		expect(within(node).getAllByRole("button")).toHaveLength(1);
		expect(await inOutAction("plan")).toBeInTheDocument();
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
		const action = await inOutAction("plan");
		fireEvent.click(action);
		const dialog = await screen.findByRole("dialog", { name: /plan/u });
		await waitFor(() => {
			expect(dialog.contains(document.activeElement)).toBe(true);
		});

		action.focus();

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
				"Step 02buildskill pending · wall time pending · cost pendingverdict pending grade pendingEsc",
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
			expect(within(dialog).getByRole("banner")).toHaveTextContent(
				"grade not recorded: not read by this test",
			);
		});
	});

	describe("what went in", () => {
		const TASK_CARD = ".boris/backlog/tasks/task-1 - Add-an-audit-log.md";

		it("lists each instruction file the step loaded with its hash, role and changed state", async () => {
			renderMonitor([recordStage("plan", FINISHED_PLAN), recordStage("build")]);

			const dialog = await openModal("plan");

			expect(
				within(dialog).getByRole("list", {
					name: "Instructions this step loaded",
				}),
			).toHaveTextContent(`${SKILL_PATH}sha 88b0d2stage skill✓unchanged`);
		});

		it("names a finished first step's artifacts in by where each came from, its checkpoint within the case", async () => {
			renderMonitor([
				recordStage("plan", {
					...FINISHED_PLAN,
					artifactsIn: {
						entries: [
							{ from: "task declaration", taskId: "ACT-1" },
							{
								from: "upstream checkpoint",
								target: "acme-api",
								upstream: "initial",
								checkpointShortId: {
									state: "available",
									shortId: "audit-log/r-0148/s0",
								},
							},
						],
						missing: [],
					},
				}),
				recordStage("build"),
			]);

			const dialog = await openModal("plan");

			expect(
				within(within(dialog).getByRole("list", { name: "Artifacts in" }))
					.getAllByRole("listitem")
					.map(({ textContent }) => textContent),
			).toEqual([
				"↓ACT-1task declaration",
				"↓acme-api at r-0148/s0initial checkpoint",
			]);
		});

		it("names a stopped step's upstream as the step before it and each workflow-state file an earlier step changed", async () => {
			renderMonitor([
				recordStage("plan", FINISHED_PLAN),
				recordStage("build", {
					status: "stopped",
					artifactsIn: {
						entries: [
							{ from: "task declaration", taskId: "ACT-1" },
							{
								from: "upstream checkpoint",
								target: "acme-api",
								upstream: "plan",
								checkpointShortId: {
									state: "available",
									shortId: "r-0148/s1",
								},
							},
							{
								from: "earlier stage",
								path: TASK_CARD,
								change: "modified",
								stage: "plan",
							},
						],
						missing: [],
					},
				}),
			]);

			const dialog = await openModal("build");

			expect(
				within(within(dialog).getByRole("list", { name: "Artifacts in" }))
					.getAllByRole("listitem")
					.map(({ textContent }) => textContent),
			).toEqual([
				"↓ACT-1task declaration",
				"↓acme-api at r-0148/s1step 01 checkpoint",
				`↓${TASK_CARD}step 01 · plan · modified`,
			]);
		});

		it("reads a stopped step's instructions its record lacks as not recorded", async () => {
			renderMonitor([
				recordStage("plan", { status: "stopped" }),
				recordStage("build"),
			]);

			const dialog = await openModal("plan");

			expect(dialog).toHaveTextContent(
				"Instructions not recorded: not read by this test",
			);
		});

		it("says which earlier step's changes a running step's inputs cannot read, and that its instructions are pending", async () => {
			renderMonitor([
				recordStage("plan", { status: "graded" }),
				recordStage("build", {
					artifactsIn: {
						entries: [
							{ from: "task declaration", taskId: "ACT-1" },
							{
								from: "upstream checkpoint",
								target: "acme-api",
								upstream: "plan",
								checkpointShortId: {
									state: "unavailable",
									reasons: ["the stage saved no checkpoint"],
								},
							},
						],
						missing: [
							{
								part: "plan",
								reason: "the stage saved no checkpoint to compare",
							},
						],
					},
				}),
			]);

			const dialog = await openModal("build");

			expect(dialog).toHaveTextContent(
				"Instructions pending: the step has not ended",
			);
			expect(
				within(within(dialog).getByRole("list", { name: "Artifacts in" }))
					.getAllByRole("listitem")
					.map(({ textContent }) => textContent),
			).toEqual([
				"↓ACT-1task declaration",
				"↓acme-api at plan's checkpointstep 01 checkpoint",
			]);
			expect(dialog).toHaveTextContent(
				"Not read: the workflow-state changes of step 01 · plan, as the stage saved no checkpoint to compare",
			);
		});
	});

	describe("what came out", () => {
		const TASK_CARD = ".boris/backlog/tasks/task-1 - Add-an-audit-log.md";
		const PLAN_JUDGE = `/api/runs/${RUN}/stages/plan/judge`;
		const PLAN_SESSION = `/api/runs/${RUN}/stages/plan/session`;

		it("lists each artifact out with the detail its record holds", async () => {
			renderMonitor([
				recordStage("plan", {
					...FINISHED_PLAN,
					artifactsOut: {
						declared: { state: "available", paths: ["PLAN.md"] },
						workflowState: {
							state: "available",
							changes: [{ path: TASK_CARD, change: "modified" }],
						},
						commitSubjects: {
							state: "available",
							subjects: ["feat: add the audit log"],
						},
						changedPaths: { state: "available", paths: ["src/audit.ts"] },
					},
				}),
				recordStage("build"),
			]);

			const dialog = await openModal("plan");

			expect(
				within(within(dialog).getByRole("list", { name: "Artifacts out" }))
					.getAllByRole("listitem")
					.map(({ textContent }) => textContent),
			).toEqual([
				"↑PLAN.mddeclared artifact",
				`↑${TASK_CARD}workflow state · modified`,
				"↑feat: add the audit logcommit",
				"↑src/audit.tschanged path",
			]);
		});

		it("names each part of artifacts out an ended step's record cannot read", async () => {
			renderMonitor([
				recordStage("plan", {
					status: "stopped",
					artifactsOut: {
						declared: { state: "available", paths: [] },
						workflowState: { state: "unavailable", reasons: ["no checkpoint"] },
						commitSubjects: { state: "available", subjects: ["wip"] },
						changedPaths: { state: "unavailable", reasons: ["no paths kept"] },
					},
				}),
				recordStage("build"),
			]);

			const dialog = await openModal("plan");

			expect(dialog).toHaveTextContent(
				"↑wipcommitNot read: the workflow-state changes, as no checkpointNot read: the changed paths, as no paths kept",
			);
		});

		it("omits artifacts out for a step that has produced none", async () => {
			renderMonitor([recordStage("plan", FINISHED_PLAN), recordStage("build")]);

			const dialog = await openModal("build");

			expect(
				within(dialog).queryByRole("heading", { name: "Artifacts out" }),
			).toBeNull();
		});

		it("sums up the judge's fired blockers and returned dimensions", async () => {
			renderMonitor(
				[recordStage("plan", FINISHED_PLAN), recordStage("build")],
				new Map<string, unknown>([
					[
						PLAN_JUDGE,
						{
							state: "judged",
							hardBlockers: [
								{ id: "scope-declared", status: "FAIL", evidence: [] },
								{ id: "no-secrets", status: "PASS", evidence: [] },
								{ id: "tests-pass", status: "PASS", evidence: [] },
							],
							dimensions: [
								{ id: "scope-discipline", grade: "C", evidence: [] },
							],
						},
					],
				]),
			);

			const dialog = await openModal("plan");

			expect(
				await within(dialog).findByText(
					"1 of 3 blockers fired · 1 dimension returned",
				),
			).toBeInTheDocument();
		});

		it("sums up what a returning judge has evaluated so far", async () => {
			renderMonitor(
				[recordStage("plan", FINISHED_PLAN), recordStage("build")],
				new Map<string, unknown>([
					[
						PLAN_JUDGE,
						{
							state: "returning",
							progress: {
								state: "returning",
								attempt: 1,
								sections: {
									hardBlockers: { returned: 1, total: 3 },
									requirements: { returned: 0, total: 1 },
									dimensions: { returned: 0, total: 2 },
								},
							},
						},
					],
				]),
			);

			const dialog = await openModal("plan");

			expect(
				await within(dialog).findByText(
					"1 of 3 blockers evaluated · 0 of 2 dimensions returned",
				),
			).toBeInTheDocument();
		});

		it("opens the selected step's full report in Results", async () => {
			renderMonitor([recordStage("plan", FINISHED_PLAN), recordStage("build")]);

			const dialog = await openModal("plan");

			expect(
				within(dialog).getByRole("link", { name: "Full step report" }),
			).toHaveAttribute("href", `/runs/${RUN}?view=results&step=plan`);
		});

		it("links the session on disk where its transcript is recorded", async () => {
			renderMonitor(
				[recordStage("plan", FINISHED_PLAN), recordStage("build")],
				new Map<string, unknown>([
					[
						PLAN_SESSION,
						{
							state: "closed",
							spans: [],
							lineCount: 12,
							transcriptPath: `.benchmark-runs/${RUN}.checkpoints/plan/transcript.jsonl`,
						},
					],
				]),
			);

			const dialog = await openModal("plan");

			expect(
				await within(dialog).findByRole("link", {
					name: "Open its transcript",
				}),
			).toHaveAttribute("href", `/runs/${RUN}/stages/plan`);
		});

		it("says when no transcript of the step's session is recorded", async () => {
			renderMonitor(
				[recordStage("plan", FINISHED_PLAN), recordStage("build")],
				new Map<string, unknown>([
					[PLAN_SESSION, { state: "closed", spans: [] }],
				]),
			);

			const dialog = await openModal("plan");

			expect(
				await within(dialog).findByText(
					"Transcript not recorded: Rehearse kept no copy of this step's session",
				),
			).toBeInTheDocument();
		});
		it("says when the step's session cannot be read", async () => {
			renderMonitor([recordStage("plan", FINISHED_PLAN), recordStage("build")]);

			const dialog = await openModal("plan");

			expect(
				await within(dialog).findByText("Could not read this step's session."),
			).toBeInTheDocument();
		});
	});

	describe("operating on the step", () => {
		it("offers replay from the checkpoint the step started from", async () => {
			renderEndedMonitor([
				recordStage("plan", {
					...FINISHED_PLAN,
					artifactsIn: {
						entries: [
							{
								from: "upstream checkpoint",
								target: "acme-api",
								upstream: "initial",
								checkpointShortId: {
									state: "unavailable",
									reasons: ["predates short ids"],
								},
							},
						],
						missing: [],
					},
				}),
				recordStage("build"),
			]);

			const dialog = await openModal("plan");

			expect(
				within(dialog).getByRole("button", { name: "Replay from checkpoint" }),
			).not.toHaveAttribute("aria-disabled");
		});

		it("disables replay with its reason when the checkpoint the step started from is missing", async () => {
			renderEndedMonitor([
				recordStage("plan", { status: "graded" }),
				recordStage("build", { status: "graded" }),
			]);

			const dialog = await openModal("build");

			expect(
				within(dialog).getByRole("button", { name: "Replay from checkpoint" }),
			).toHaveAttribute("aria-disabled", "true");
			expect(dialog).toHaveTextContent(
				"Replay from checkpointbuild has no checkpoint to replay from",
			);
		});

		it("withholds replay while the source run is still active", async () => {
			renderMonitor([recordStage("plan", FINISHED_PLAN), recordStage("build")]);

			const dialog = await openModal("plan");

			expect(dialog).toHaveTextContent(
				"Wait for the source run to end before replaying a step",
			);
			expect(
				within(dialog).getByRole("button", { name: "Replay from checkpoint" }),
			).toHaveAttribute("aria-disabled", "true");
		});

		it("withholds replay when the selected step has no ended record", async () => {
			renderMonitor([recordStage("plan", FINISHED_PLAN), recordStage("build")]);

			const dialog = await openModal("build");

			expect(dialog).toHaveTextContent(
				"build has no completed step record to replay",
			);
			expect(
				within(dialog).getByRole("button", { name: "Replay from checkpoint" }),
			).toHaveAttribute("aria-disabled", "true");
		});

		it("opens the step's case's step editor on this step, and skill editing on the Corpus screen", async () => {
			const rubric = "cases/audit-log/rubrics/plan.json";
			renderMonitor(
				[recordStage("plan", FINISHED_PLAN), recordStage("build")],
				new Map([
					[
						"/api/cases/audit-log/steps",
						{
							caseId: "audit-log",
							pipeline: "cases/audit-log/pipelines/default.json",
							stages: [
								{
									name: "plan",
									kind: "planning",
									skill: "plan",
									rubric,
									requiresAcceptanceCriteria: false,
								},
								{ name: "build", kind: "delivery", skill: "build", rubric },
							],
							rubrics: [rubric],
						},
					],
				]),
			);

			const dialog = await openModal("plan");
			expect(
				within(dialog).getByRole("link", { name: "Edit its skill" }),
			).toHaveAttribute(
				"href",
				`/corpus?file=${encodeURIComponent(SKILL_PATH)}&sourceRun=${RUN}&sourceStep=plan`,
			);
			fireEvent.click(
				within(dialog).getByRole("button", { name: "Edit this step" }),
			);

			const editor = await screen.findByRole("dialog", {
				name: "Edit steps · audit-log",
			});
			const plan = await within(editor).findByRole("group", { name: "Step 1" });
			await waitFor(() => {
				expect(within(plan).getByLabelText("Name")).toHaveFocus();
			});
		});
	});
});
