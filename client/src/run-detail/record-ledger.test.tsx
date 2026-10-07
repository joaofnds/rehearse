import { afterEach, describe, expect, it } from "bun:test";
import { screen, within } from "@testing-library/react";
import type { RunRecord, RunRecordStage } from "#server/run-record";
import type { StageSession } from "#server/stage-session";
import {
	CORPUS,
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

function renderLedger(routes: ReadonlyMap<string, unknown> = new Map()): void {
	renderRunDetail(
		new Map<string, unknown>([
			[`/api/runs/${RUN}`, stoppedWithFigures()],
			...routes,
		]),
		[],
		LEDGER,
	);
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
});
