import { afterEach, describe, expect, it } from "bun:test";
import { fireEvent, screen, within } from "@testing-library/react";
import { renderAppWithStub } from "#client/test-support/render-app";
import { recordStage } from "#client/test-support/run-record";
import { runRow } from "#client/test-support/runs-in-flight";
import type { RunRecord, RunRecordStage } from "#server/run-record";
import { INTERRUPTED_REASON, RUN_FAILED_REASON } from "#server/run-record";
import type { StageJudge } from "#server/stage-judge";
import type { StageSession } from "#server/stage-session";
import {
	ANALYSES,
	CORPUS,
	history,
	noAnalysis,
	RUN,
	renderRunDetail,
	stoppedAtBuild,
} from "./run-detail-fixtures";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

const LEDGER = `/runs/${RUN}?layout=ledger`;

/** The stopped run with shape's figures and both recorded stages' corpus recorded. */
function stoppedWithFigures(): RunRecord {
	const record = stoppedAtBuild();
	const corpus: Partial<RunRecordStage> = {
		corpusVersion: { kind: "version", digest: CORPUS },
	};
	const figures: Partial<RunRecordStage> = {
		...corpus,
		checkpointShortId: { state: "available", shortId: "c-0147-1" },
		wallTime: { state: "available", ms: 82_000 },
		sessionCost: { state: "available", usd: 0.3 },
		judgeCost: { state: "available", usd: 0.04 },
	};
	const [first, second, ...later] = record.stages;

	return {
		...record,
		stages:
			first === undefined || second === undefined
				? []
				: [{ ...first, ...figures }, { ...second, ...corpus }, ...later],
	};
}

const FIRST_STEP_SESSION = `/api/runs/${RUN}/stages/shape/session`;

function closedSession(lineCount: number): StageSession {
	return {
		state: "closed",
		spans: [],
		lineCount,
		transcriptPath: `.benchmark-runs/${RUN}.shape.session/transcript.jsonl`,
	};
}

const STOPPED_STEP_SESSION = `/api/runs/${RUN}/stages/build/session`;

const STOPPED_STEP_JUDGE = `/api/runs/${RUN}/stages/build/judge`;

function judged(): StageJudge {
	return {
		state: "judged",
		hardBlockers: [
			{
				id: "scope-declared-before-edit",
				status: "FAIL",
				evidence: [
					{
						source: "transcript",
						path: "transcript",
						claim: "The agent chose a scope without asking",
						quote: "I'll take the small scope",
						place: "exchange 3 message, characters 0-25",
					},
				],
			},
			{ id: "no-secrets-in-diff", status: "PASS", evidence: [] },
		],
		dimensions: [
			{
				id: "scope-discipline",
				grade: "C",
				evidence: [
					{
						source: "diff",
						path: "src/a.ts",
						claim: "Edits files outside the declared scope",
					},
				],
			},
			{ id: "test-quality", grade: "B", evidence: [] },
		],
	};
}

function renderLedger(
	routes: ReadonlyMap<string, unknown> = new Map(),
	record: RunRecord = stoppedWithFigures(),
): void {
	renderRunDetail(
		new Map<string, unknown>([[`/api/runs/${RUN}`, record], ...routes]),
		[],
		LEDGER,
	);
}

/** Each ledger card's footer, in the cards' order. */
async function ledgerFooters(): Promise<readonly HTMLElement[]> {
	const cards = await ledgerCards();

	return cards.map((card) => {
		const footer = card.querySelector("footer");
		if (!(footer instanceof HTMLElement)) {
			throw new Error(`${card.getAttribute("aria-label")} has no footer`);
		}

		return footer;
	});
}
async function ledgerCards(): Promise<readonly HTMLElement[]> {
	const ledger = await screen.findByRole("region", { name: "Record ledger" });

	return within(ledger).getAllByRole("article");
}

describe("Record ledger", () => {
	it("shows one card per stage with a record, in pipeline order", async () => {
		renderLedger();

		const cards = await ledgerCards();

		expect(cards.map((card) => card.getAttribute("aria-label"))).toEqual([
			"Step 1 · shape",
			"Step 2 · build",
		]);
	});

	it("heads each card with its number, name, status, meta, corpus and grade", async () => {
		renderLedger(new Map([[FIRST_STEP_SESSION, closedSession(402)]]));

		const [firstStep] = await ledgerCards();

		expect(
			within(firstStep ?? document.body).getByRole("heading", { level: 2 })
				.parentElement,
		).toHaveTextContent(
			/^01shape✓accepted1m22s · \$0\.34 · 402 linescorpus@a41c7eA$/u,
		);
	});

	it("marks the stage the run stopped at with the accent and no error colour", async () => {
		renderLedger();

		const [firstStep, stoppedStep] = await ledgerCards();

		expect(stoppedStep).toHaveClass("border-deeper");
		expect(stoppedStep?.firstElementChild).toHaveClass("bg-fired");
		expect(stoppedStep).toHaveTextContent("◼below minimum B · run stopped");
		expect(stoppedStep?.outerHTML).not.toMatch(/destructive|danger|red-/u);
		expect(firstStep).not.toHaveClass("border-deeper");
	});

	it("lays the stage's hard blockers on the left and its dimensions on the right", async () => {
		renderLedger(new Map([[STOPPED_STEP_JUDGE, judged()]]));

		const [, stoppedStep] = await ledgerCards();
		const blockers = await within(stoppedStep ?? document.body).findByRole(
			"list",
			{ name: "Hard blockers" },
		);
		const dimensions = within(stoppedStep ?? document.body).getByRole("list", {
			name: "Quality dimensions",
		});

		expect(
			within(blockers)
				.getAllByRole("listitem")
				.map((item) => item.textContent),
		).toEqual(["✕scope-declared-before-editfired", "✓no-secrets-in-diffclear"]);
		expect(
			within(dimensions)
				.getAllByRole("listitem")
				.map((item) => item.textContent),
		).toEqual(["scope-discipline▮▮▮▯▯C", "test-quality▮▮▮▮▯B"]);
		expect(blockers.parentElement?.parentElement).toHaveClass("grid-cols-2");
		expect(blockers.parentElement?.nextElementSibling).toContainElement(
			dimensions,
		);
	});

	it("states whether each stage kept its checkpoint or the repository was restored", async () => {
		renderLedger();

		const [firstStep, stoppedStep] = await ledgerFooters();

		expect(
			within(firstStep ?? document.body).getByText(
				"c-0147-1 · frozen state retained",
			),
		).toBeInTheDocument();
		expect(
			within(stoppedStep ?? document.body).getByText(
				"no checkpoint saved · repository restored",
			),
		).toBeInTheDocument();
	});

	it("offers a replay from each stage", async () => {
		renderLedger();

		const footers = await ledgerFooters();

		expect(
			footers.map((footer) =>
				within(footer)
					.getByRole("button", { name: /^Replay from here/u })
					.getAttribute("aria-disabled"),
			),
		).toEqual([null, null]);
	});

	it("disables the replay with its reason when the checkpoint the stage started from is missing", async () => {
		renderLedger(new Map(), stoppedAtBuild("missing"));

		const [, stoppedStep] = await ledgerFooters();

		expect(
			within(stoppedStep ?? document.body).getByRole("button", {
				name: "Replay from here: build has no checkpoint to replay from",
			}),
		).toHaveAttribute("aria-disabled", "true");
	});

	it("counts the stage's cited evidence on its toggle", async () => {
		renderLedger(new Map([[STOPPED_STEP_JUDGE, judged()]]));

		const [, stoppedStep] = await ledgerFooters();

		expect(
			await within(stoppedStep ?? document.body).findByRole("button", {
				name: "2 cited",
			}),
		).toHaveAttribute("aria-expanded", "false");
	});

	describe("expanded evidence", () => {
		async function openEvidence(session: StageSession): Promise<HTMLElement> {
			renderLedger(
				new Map<string, unknown>([
					[STOPPED_STEP_JUDGE, judged()],
					[STOPPED_STEP_SESSION, session],
				]),
			);
			const [, stoppedStep] = await ledgerCards();
			const card = stoppedStep ?? document.body;

			fireEvent.click(
				await within(card).findByRole("button", { name: "2 cited" }),
			);

			return within(card).getByRole("region", { name: "Cited evidence" });
		}

		it("lays each item out with its source, locator and what it supports beside its quote", async () => {
			const evidence = await openEvidence(closedSession(1284));

			const items = within(evidence).getAllByRole("listitem");

			expect(items.map((item) => item.textContent)).toEqual([
				"transcriptexchange 3 message, characters 0-25supports scope-declared-before-editI'll take the small scope",
				"diffsrc/a.tssupports scope-discipline",
			]);
			expect(items[0]?.firstElementChild?.parentElement).toHaveClass(
				"grid-cols-ledger-evidence",
			);
			expect(
				within(evidence).getByRole("link", {
					name: "exchange 3 message, characters 0-25",
				}),
			).toHaveAttribute(
				"href",
				`/runs/${RUN}/stages/build/evidence/hardBlockers/scope-declared-before-edit/0`,
			);
			expect(
				within(evidence).getByRole("link", { name: "src/a.ts" }),
			).toHaveAttribute(
				"href",
				`/runs/${RUN}/stages/build/evidence/dimensions/scope-discipline/0`,
			);
		});

		it("closes with a link to the session on disk", async () => {
			const evidence = await openEvidence(closedSession(1284));

			expect(evidence).toHaveTextContent(
				/Uncited spans are not stored here\. Open the full session on disk$/u,
			);
			expect(
				within(evidence).getByRole("link", {
					name: "Open the full session on disk",
				}),
			).toHaveAttribute("href", `/runs/${RUN}/stages/build`);
		});

		it("says why there is no session to open when no transcript was kept", async () => {
			const evidence = await openEvidence({
				state: "closed",
				spans: [],
			});

			expect(evidence).toHaveTextContent(
				"Uncited spans are not stored here. The full session is not recorded: Rehearse kept no copy of this step's session",
			);
		});
	});

	describe("stages the run never reached", () => {
		/** The run ended or in flight at build, with shape's record alone. */
		function renderReachedFirstStep(
			status: string,
			finalOutcome: RunRecord["finalOutcome"],
		): void {
			const record = stoppedAtBuild();
			renderAppWithStub(
				LEDGER,
				new Map<string, unknown>([
					[
						"/api/runs",
						history([
							runRow({
								run: RUN,
								status,
								stage: "build",
								corpusVersion: { kind: "version", digest: CORPUS },
							}),
						]),
					],
					[
						`/api/runs/${RUN}`,
						{
							...record,
							status: { state: "available", status },
							finalOutcome,
							stages: record.stages.map((stage) =>
								stage.stage === "shape" ? stage : recordStage(stage.stage),
							),
						},
					],
					[ANALYSES, noAnalysis()],
				]),
			);
		}

		function unreached(): Promise<HTMLElement> {
			return screen.findByRole("list", { name: "Stages without a record" });
		}

		it("notes on a stopped run that each one never ran, as a recorded outcome", async () => {
			renderLedger();

			const note = within(await unreached()).getByRole("listitem");

			expect(note).toHaveTextContent(
				"Step 3 · verify never ran. The run stopped after step 2 fell below the minimum and the target repository was restored. This is a recorded outcome for corpus@a41c7e, not a failed execution.",
			);
			expect(note).toHaveClass("border-dashed");
		});

		it("names a stop its judge made without the minimum", async () => {
			const record = stoppedWithFigures();
			const [first, second, ...later] = record.stages;
			const stoppedByVerdict: Partial<RunRecordStage> = {
				grade: {
					state: "available",
					letter: "B",
					verdict: "STOP",
					reachesMinimum: true,
				},
			};
			renderLedger(new Map(), {
				...record,
				stages:
					first === undefined || second === undefined
						? []
						: [first, { ...second, ...stoppedByVerdict }, ...later],
			});

			expect(await unreached()).toHaveTextContent(
				"Step 3 · verify never ran. The run stopped after step 2 and the target repository was restored. This is a recorded outcome for corpus@a41c7e, not a failed execution.",
			);
		});

		it("shows them as queued while the run is in flight", async () => {
			renderReachedFirstStep("RUNNING", { status: "PENDING", stage: "build" });

			const items = within(await unreached()).getAllByRole("listitem");

			expect(items.map((item) => item.textContent)).toEqual([
				"Step 2 · build●session running",
				"Step 3 · verify○queued",
			]);
		});

		it.each([
			["FAILED", RUN_FAILED_REASON],
			["INTERRUPTED", INTERRUPTED_REASON],
		])(
			"states a %s run's own reason and no recorded outcome",
			async (status, reason) => {
				renderReachedFirstStep(status, {
					status: "NOT_REACHED",
					stage: "build",
					reason,
				});

				const items = within(await unreached()).getAllByRole("listitem");

				expect(items.map((item) => item.textContent)).toEqual([
					`Step 2 · build did not run: ${reason}.`,
					`Step 3 · verify did not run: ${reason}.`,
				]);
				expect(items[0]).not.toHaveClass("border-dashed");
			},
		);
	});
});
