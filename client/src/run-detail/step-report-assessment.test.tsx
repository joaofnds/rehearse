import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, within } from "@testing-library/react";

import NamedHistoryBuilder from "#client/run-history/run-history-page-named-history-builder";
import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import {
	RUN,
	RunRecordBuilder,
	RunRecordStageBuilder,
	renderRunDetail,
	stoppedAtBuild,
} from "#client/test-support/run-detail";
import type { WaitingJudgeExample } from "#client/test-support/run-detail/step-judge-test-fixtures";
import {
	WAITING_JUDGE_EXAMPLES,
	buildJudged,
} from "#client/test-support/run-detail/step-judge-test-fixtures";

import {
	BUILD_JUDGE,
	originalFetch,
	renderBuildReport,
	stepReport,
	stoppedWithBuildFigures,
} from "./step-report-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("the selected step in Results", () => {
	describe("step report", () => {
		it.each([...WAITING_JUDGE_EXAMPLES])(
			"says on $run whether a waiting judge can still return",
			readsWaitingJudge,
		);

		it(
			"titles the report with the stage's skill, wall time, cost and transcript lines",
			titlesTheReportWithTheStageSSkillWallTimeCostAndTranscriptLines,
		);

		it(
			"states the grade against the run's minimum and counts the blockers that fired",
			statesTheGradeAgainstTheRunSMinimumAndCountsTheBlockersThatFired,
		);

		it(
			"reads an unrecorded grade's reason apart from the run's minimum",
			readsAnUnrecordedGradeSReasonApartFromTheRunSMinimum,
		);

		it(
			"lists each hard blocker as fired or clear",
			listsEachHardBlockerAsFiredOrClear,
		);

		it(
			"explains an empty saved blocker assessment",
			explainsAnEmptySavedBlockerAssessment,
		);

		it(
			"lists each quality dimension with its grade and the judge's first claim as its note",
			listsEachQualityDimensionWithItsGradeAndTheJudgeSFirstClaimAsItsNote,
		);
	});
});

async function titlesTheReportWithTheStageSSkillWallTimeCostAndTranscriptLines(): Promise<void> {
	renderBuildReport();

	const report = await stepReport();

	expect(
		await within(report).findByText(
			"skills/implement/SKILL.md · 4m02s · $1.12 · 1,284 transcript lines",
		),
	).toBeInTheDocument();
}

async function statesTheGradeAgainstTheRunSMinimumAndCountsTheBlockersThatFired(): Promise<void> {
	renderBuildReport();

	const report = await stepReport();

	expect(
		within(report).getByRole("group", { name: "Grade" }),
	).toHaveTextContent("GradeDmin B");
	expect(
		within(report).getByRole("group", { name: "Verdict" }),
	).toHaveTextContent("Verdict◼stopped2 blockers fired");
}

async function readsAnUnrecordedGradeSReasonApartFromTheRunSMinimum(): Promise<void> {
	renderBuildReport({
		record: new RunRecordBuilder(stoppedWithBuildFigures())
			.withStage({
				grade: {
					reasons: ["the stage wrote no record"],
					state: "unavailable",
				},
				stage: "build",
			})
			.build(),
	});

	const grade = within(await stepReport()).getByRole("group", {
		name: "Grade",
	});

	expect(
		within(grade).getByText("grade not recorded: the stage wrote no record"),
	).toBeInTheDocument();
	expect(within(grade).getByText("min B")).toBeInTheDocument();
}

async function listsEachHardBlockerAsFiredOrClear(): Promise<void> {
	renderBuildReport();

	const report = await stepReport();
	const rows = within(
		within(report).getByRole("list", { name: "Hard blockers" }),
	).getAllByRole("listitem");

	expect(rows.map((row) => row.textContent)).toEqual([
		"✕scope-declared-before-editfired1 cited",
		"✕tests-pass-before-handofffired1 cited",
	]);
	const clear = within(report).getByText("1 clear blocker & citations", {
		selector: "summary",
	});
	expect(clear.parentElement).not.toHaveAttribute("open");
	fireEvent.click(clear);
	expect(
		within(report).getByRole("list", { name: "Clear hard blockers" }),
	).toHaveTextContent("✓no-secrets-in-diffclearno evidence");
}

async function explainsAnEmptySavedBlockerAssessment(): Promise<void> {
	renderBuildReport({
		extra: new Map<string, unknown>([
			[BUILD_JUDGE, { ...buildJudged(), hardBlockers: [] }],
		]),
	});

	expect(
		await screen.findByText("No hard blocker results were recorded."),
	).toBeInTheDocument();
}

async function listsEachQualityDimensionWithItsGradeAndTheJudgeSFirstClaimAsItsNote(): Promise<void> {
	renderBuildReport();

	const report = await stepReport();
	const rows = within(
		within(report).getByRole("list", { name: "Quality dimensions" }),
	).getAllByRole("listitem");

	expect(rows.map((row) => row.textContent)).toEqual([
		"scope-discipline▮▮▮▯▯CEdits files outside the declared scope2 cited",
		"test-quality▮▮▮▮▯Bno evidence",
	]);
}

async function readsWaitingJudge({
	status,
	finalOutcome,
	words,
	verdict,
}: WaitingJudgeExample): Promise<void> {
	const record = stoppedAtBuild();
	const fetchReplies = new Map<string, unknown>([
		[
			"/api/runs",
			new NamedHistoryBuilder({
				rows: [
					new PipelineRunRowBuilder({ run: RUN, status })
						.withExecutionProgress({ stage: "build" })
						.build(),
				],
			}).build(),
		],
		[
			`/api/runs/${RUN}`,
			{
				...record,
				finalOutcome,
				stages: record.stages.map((stage) =>
					stage.stage === "build"
						? new RunRecordStageBuilder({
								stage: "build",
								status: "awaiting-judgment",
							}).build()
						: stage,
				),
				status: { state: "available", status },
			},
		],
		[BUILD_JUDGE, { state: "waiting" }],
	]);
	renderRunDetail(fetchReplies, [], `/runs/${RUN}?layout=rail&step=build`);

	const report = await screen.findByRole("region", {
		name: "Step report",
	});

	expect(await within(report).findByText(words)).toBeInTheDocument();
	expect(
		within(report).getByRole("group", { name: "Verdict" }),
	).toHaveTextContent(verdict);
}
