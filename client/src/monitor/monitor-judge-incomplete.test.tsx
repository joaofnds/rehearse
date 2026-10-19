import { afterEach, describe, expect, it, setSystemTime } from "bun:test";

import { waitFor, within } from "@testing-library/react";

import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import type { StageJudge } from "#server/stage-judge";

import {
	judgePane,
	renderJudge,
	returningJudge,
} from "./monitor-judge-test-fixtures";
import { RUN, originalFetch, renderMonitor } from "./monitor-test-fixtures";

interface PendingJudgeExample {
	readonly words: string;
	readonly judge: StageJudge;
}

interface PendingSpendExample {
	readonly name: string;
	readonly spentUsd: number | undefined;
}

const PENDING_JUDGES: readonly PendingJudgeExample[] = [
	{
		judge: returningJudge({ returned: 3, total: 3 }, { returned: 1, total: 2 }),
		words: "dimensions still returning",
	},
	{
		judge: returningJudge({ returned: 1, total: 3 }, { returned: 2, total: 2 }),
		words: "blockers still returning",
	},
	{
		judge: returningJudge({ returned: 3, total: 3 }, { returned: 2, total: 2 }),
		words: "grade not recorded yet",
	},
	{ judge: { state: "returning" } as const, words: "nothing returned yet" },
];

async function readsPendingVerdict({
	words,
	judge,
}: PendingJudgeExample): Promise<void> {
	renderJudge(judge);

	const card = await within(await judgePane()).findByRole("group", {
		name: "Verdict and grade",
	});

	expect(card).toHaveTextContent(`Verdict◌pending: ${words}`);
}

const PENDING_SPENDS: readonly PendingSpendExample[] = [
	{ name: "no spend is recorded", spentUsd: undefined },
	{ name: "nothing is spent yet", spentUsd: 0 },
];

async function readsPendingJudgeCost({
	spentUsd,
}: PendingSpendExample): Promise<void> {
	renderJudge({
		...returningJudge({ returned: 0, total: 3 }, { returned: 0, total: 2 }),
		...(spentUsd !== undefined && { spentUsd }),
	});

	const pane = await judgePane();

	await waitFor(() => {
		expect(pane).toHaveTextContent("independent session · cost pending");
	});
}

afterEach(() => {
	globalThis.fetch = originalFetch;
	setSystemTime();
});

describe("/monitor judge pane", () => {
	describe("when its judge has returned less than every item", () => {
		it.each([...PENDING_JUDGES])(
			"says the verdict is pending: $words",
			readsPendingVerdict,
		);

		it(
			"shows progress recorded before per-item results as its counts alone",
			showsProgressRecordedBeforePerItemResultsAsItsCountsAlone,
		);

		it(
			"shows no counts between a rejected attempt and the next one's first reading",
			showsNoCountsBetweenARejectedAttemptAndTheNextOneSFirstReading,
		);

		it.each([...PENDING_SPENDS])(
			"says the judge cost is pending while $name",
			readsPendingJudgeCost,
		);
	});

	describe("before or without a judged grade", () => {
		it("says the step's judge has not started", saysTheStepSJudgeHasNotStarted);

		it(
			"says a step that ended without a judged grade has no verdict",
			saysAStepThatEndedWithoutAJudgedGradeHasNoVerdict,
		);

		it(
			"says when it could not read the step's judge",
			saysWhenItCouldNotReadTheStepSJudge,
		);
	});
});

async function saysWhenItCouldNotReadTheStepSJudge(): Promise<void> {
	renderMonitor(
		new PipelineRunRowBuilder({ run: RUN })
			.withExecutionProgress({ stage: "build" })
			.build(),
	);

	const pane = await judgePane();

	expect(await within(pane).findByRole("alert")).toHaveTextContent(
		"Could not read this step's judge.",
	);
}

async function showsProgressRecordedBeforePerItemResultsAsItsCountsAlone(): Promise<void> {
	renderJudge(
		returningJudge({ returned: 1, total: 3 }, { returned: 0, total: 2 }),
	);
	const pane = await judgePane();

	const headings = await within(pane).findAllByRole("heading", {
		level: 3,
	});

	expect(headings.map((heading) => heading.textContent)).toEqual([
		"Hard blockers · 1 of 3 evaluated",
		"Quality dimensions · 0 of 2 returned",
	]);
	expect(within(pane).queryByRole("list")).toBeNull();
}

async function showsNoCountsBetweenARejectedAttemptAndTheNextOneSFirstReading(): Promise<void> {
	renderJudge({ spentUsd: 0.25, state: "returning" });
	const pane = await judgePane();

	await within(pane).findByRole("group", { name: "Verdict and grade" });

	expect(within(pane).queryByRole("heading", { level: 3 })).toBeNull();
	expect(pane).toHaveTextContent("independent session · $0.25 so far");
}

async function saysTheStepSJudgeHasNotStarted(): Promise<void> {
	renderJudge({ state: "waiting" });

	const pane = await judgePane();

	expect(
		await within(pane).findByText("This step's judge has not started yet."),
	).toBeInTheDocument();
	expect(within(pane).queryByRole("note")).toBeNull();
}

async function saysAStepThatEndedWithoutAJudgedGradeHasNoVerdict(): Promise<void> {
	renderJudge({ state: "not-judged" });

	const pane = await judgePane();

	expect(
		await within(pane).findByText(
			"This step ended without a judged grade, so there is no verdict to show.",
		),
	).toBeInTheDocument();
}
