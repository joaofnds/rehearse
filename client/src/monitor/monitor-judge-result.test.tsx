import { afterEach, describe, expect, it, setSystemTime } from "bun:test";

import { fireEvent, within } from "@testing-library/react";

import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import { SHELL_BASELINE } from "#client/test-support/render-app";
import {
	RunRecordBuilder,
	RunRecordStageBuilder,
} from "#client/test-support/run-detail";
import type { RunRecord, RunRecordStage } from "#server/run-record";

import {
	ACCEPTED_C,
	JUDGED,
	PLAN_JUDGE,
	judgePane,
	judgeRowReadings,
	qualityReadings,
	renderJudged,
} from "./monitor-judge-test-fixtures";
import {
	RUN,
	graphNode,
	monitorBodies,
	originalFetch,
	renderMonitor,
	selectStage,
	stubFetchByPath,
} from "./monitor-test-fixtures";

const recordWithPlan = (
	plan: Partial<Omit<RunRecordStage, "stage">> | undefined,
): RunRecord =>
	new RunRecordBuilder({
		run: RUN,
		stages: [
			new RunRecordStageBuilder({ stage: "plan", ...plan }).build(),
			new RunRecordStageBuilder().build(),
		],
	}).build();

const expectedChildrenCount = 3;

afterEach(() => {
	globalThis.fetch = originalFetch;
	setSystemTime();
});

describe("/monitor judge pane", () => {
	describe("for a judged stage", () => {
		it(
			"shows the verdict and grade the run record holds, with the judge's recorded cost",
			showsTheVerdictAndGradeTheRunRecordHoldsWithTheJudgeSRecordedCost,
		);

		it(
			"reads a letter below the run's minimum as stopped, as the stage's node does",
			readsALetterBelowTheRunSMinimumAsStoppedAsTheStageSNodeDoes,
		);

		it(
			"keeps the verdict pending until the run record says how the stage ended",
			keepsTheVerdictPendingUntilTheRunRecordSaysHowTheStageEnded,
		);

		it(
			"reads the verdict once the run record catches up with the judge, with no run event between",
			readsTheVerdictOnceTheRunRecordCatchesUpWithTheJudgeWithNoRunEventBetween,
		);

		it(
			"lists every judged blocker and dimension with how much evidence each cites",
			listsEveryJudgedBlockerAndDimensionWithHowMuchEvidenceEachCites,
		);

		it(
			"opens a blocker's evidence with its source, a link to where it is cited, and its quote",
			opensABlockerSEvidenceWithItsSourceALinkToWhereItIsCitedAndItsQuote,
		);

		it(
			"opens a dimension's evidence, naming the file a citation without a quote points to",
			opensADimensionSEvidenceNamingTheFileACitationWithoutAQuotePointsTo,
		);

		it("closes evidence it opened", closesEvidenceItOpened);
	});
});

async function showsTheVerdictAndGradeTheRunRecordHoldsWithTheJudgeSRecordedCost(): Promise<void> {
	await renderJudged({ ...ACCEPTED_C, letter: "B" });

	const pane = await judgePane();
	const card = await within(pane).findByRole("group", {
		name: "Verdict and grade",
	});

	expect(card).toHaveTextContent(
		"Verdict✓Continued at minimum B-: 2 blockers fired",
	);
	expect(card).toHaveTextContent("GradeB");
	expect(pane).toHaveTextContent("independent session · $0.22");
	expect(within(pane).queryByText("grading")).toBeNull();
}

async function readsALetterBelowTheRunSMinimumAsStoppedAsTheStageSNodeDoes(): Promise<void> {
	await renderJudged({ ...ACCEPTED_C, letter: "D", reachesMinimum: false });

	const card = await within(await judgePane()).findByRole("group", {
		name: "Verdict and grade",
	});

	expect(card).toHaveTextContent("Verdict◼stopped: 2 blockers fired");
}

async function keepsTheVerdictPendingUntilTheRunRecordSaysHowTheStageEnded(): Promise<void> {
	await renderJudged(
		{ reasons: ["awaiting the judge"], state: "unavailable" },
		"awaiting-judgment",
	);

	const card = await within(await judgePane()).findByRole("group", {
		name: "Verdict and grade",
	});

	expect(card).toHaveTextContent("Verdict◌pending: grade not recorded yet");
}

async function readsTheVerdictOnceTheRunRecordCatchesUpWithTheJudgeWithNoRunEventBetween(): Promise<void> {
	renderMonitor(
		new PipelineRunRowBuilder({ run: RUN })
			.withExecutionProgress({ stage: "build" })
			.build(),
		new Map<string, unknown>([
			[`/api/runs/${RUN}`, recordWithPlan({ status: "awaiting-judgment" })],
		]),
	);
	await graphNode("plan");
	const fetchReplies = new Map<string, unknown>([
		...SHELL_BASELINE,
		...monitorBodies(
			new PipelineRunRowBuilder({ run: RUN })
				.withExecutionProgress({ stage: "build" })
				.build(),
		),
		[
			`/api/runs/${RUN}`,
			recordWithPlan({ grade: ACCEPTED_C, status: "graded" }),
		],
		[PLAN_JUDGE, JUDGED],
	]);
	stubFetchByPath(fetchReplies);

	await selectStage("plan");

	expect(
		await within(await judgePane()).findByText(
			"Continued · minimum unavailable: 2 blockers fired",
		),
	).toBeInTheDocument();
}

async function listsEveryJudgedBlockerAndDimensionWithHowMuchEvidenceEachCites(): Promise<void> {
	await renderJudged(ACCEPTED_C);

	expect(await judgeRowReadings("Hard blockers")).toEqual([
		"✕scope-declared-before-editfired1 cited",
		"✓no-secrets-in-diffclearno evidence",
		"✕tests-pass-before-handofffiredno evidence",
	]);
	expect(await qualityReadings()).toEqual(["scope-discipline▮▮▮▯▯C1 cited"]);
	for (const toggle of within(await judgePane()).getAllByRole("button", {
		name: "no evidence",
	})) {
		expect(toggle).toHaveAttribute("aria-disabled", "true");
	}
}

async function opensABlockerSEvidenceWithItsSourceALinkToWhereItIsCitedAndItsQuote(): Promise<void> {
	await renderJudged(ACCEPTED_C);
	const pane = await judgePane();
	const rows = await within(pane).findByRole("list", {
		name: "Hard blockers",
	});

	fireEvent.click(within(rows).getByRole("button", { name: "1 cited" }));

	const toggle = within(pane).getByRole("button", {
		name: "hide evidence",
	});
	const shown = document.querySelector(
		`#${CSS.escape(toggle.getAttribute("aria-controls") ?? "")}`,
	);
	expect(toggle).toHaveAttribute("aria-expanded", "true");
	expect(rows.children).toHaveLength(expectedChildrenCount);
	expect(shown).toHaveTextContent(
		"Cited evidencetranscriptexchange 3 message, characters 0-25I'll take the small scope",
	);
	expect(
		within(pane).getByRole("link", {
			name: "exchange 3 message, characters 0-25",
		}),
	).toHaveAttribute(
		"href",
		`/runs/${RUN}/stages/plan/evidence/hardBlockers/scope-declared-before-edit/0`,
	);
}

async function opensADimensionSEvidenceNamingTheFileACitationWithoutAQuotePointsTo(): Promise<void> {
	await renderJudged(ACCEPTED_C);
	const rows = await within(await judgePane()).findByRole("list", {
		name: "Quality dimensions",
	});

	fireEvent.click(within(rows).getByRole("button", { name: "1 cited" }));

	expect(
		within(rows).getByRole("link", { name: "src/a.ts:3-4" }),
	).toHaveAttribute(
		"href",
		`/runs/${RUN}/stages/plan/evidence/dimensions/scope-discipline/0`,
	);
	expect(within(rows).queryByRole("blockquote")).toBeNull();
}

async function closesEvidenceItOpened(): Promise<void> {
	await renderJudged(ACCEPTED_C);
	const pane = await judgePane();
	const rows = await within(pane).findByRole("list", {
		name: "Hard blockers",
	});
	fireEvent.click(within(rows).getByRole("button", { name: "1 cited" }));

	fireEvent.click(within(pane).getByRole("button", { name: "hide evidence" }));

	expect(within(pane).queryByRole("link", { name: /exchange 3/u })).toBeNull();
}
