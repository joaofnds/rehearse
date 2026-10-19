import { screen, within } from "@testing-library/react";

import type { MonitoredStage } from "#client/monitor/run-record-query";
import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import {
	RunRecordBuilder,
	RunRecordStageBuilder,
} from "#client/test-support/run-detail";
import type { StageJudge } from "#server/stage-judge";

import { RUN, renderMonitor, selectStage } from "./monitor-test-fixtures";

const BUILD_JUDGE = `/api/runs/${RUN}/stages/build/judge`;

async function judgeRowReadings(list: string): Promise<readonly string[]> {
	const rows = await within(await judgePane()).findByRole("list", {
		name: list,
	});

	return within(rows)
		.getAllByRole("listitem")
		.map((row) => row.textContent ?? "");
}

async function qualityReadings(): Promise<readonly (string | null)[]> {
	const rows = await within(await judgePane()).findByRole("list", {
		name: "Quality dimensions",
	});
	return within(rows)
		.getAllByRole("listitem")
		.map((row) => row.textContent);
}

function renderJudge(judge: StageJudge): void {
	renderMonitor(
		new PipelineRunRowBuilder({ run: RUN })
			.withExecutionProgress({ stage: "build", stageState: "judge grading" })
			.build(),
		new Map<string, StageJudge>([[BUILD_JUDGE, judge]]),
	);
}

const RETURNING: StageJudge = {
	progress: {
		attempt: 1,
		items: {
			dimensions: [
				{ grade: "B", id: "scope-discipline" },
				{ id: "diff-hygiene" },
			],
			hardBlockers: [
				{ id: "no-unrelated-refactors", status: "FAIL" },
				{ id: "tests-pass-before-handoff", status: "PASS" },
				{ id: "no-secrets-in-diff" },
			],
		},
		sections: {
			dimensions: { returned: 1, total: 2 },
			hardBlockers: { returned: 2, total: 3 },
			requirements: { returned: 0, total: 1 },
		},
		state: "returning",
	},
	spentUsd: 0.08,
	state: "returning",
};

const PLAN_JUDGE = `/api/runs/${RUN}/stages/plan/judge`;

const JUDGED: StageJudge = {
	dimensions: [
		{
			evidence: [
				{
					claim: "Names the rule",
					path: "src/a.ts",
					place: "src/a.ts:3-4",
					source: "diff",
				},
			],
			grade: "C",
			id: "scope-discipline",
		},
	],
	hardBlockers: [
		{
			evidence: [
				{
					claim: "The agent chose a scope without asking",
					path: "transcript",
					place: "exchange 3 message, characters 0-25",
					quote: "I'll take the small scope",
					source: "transcript",
				},
			],
			id: "scope-declared-before-edit",
			status: "FAIL",
		},
		{ evidence: [], id: "no-secrets-in-diff", status: "PASS" },
		{ evidence: [], id: "tests-pass-before-handoff", status: "FAIL" },
	],
	state: "judged",
};

async function renderJudged(
	grade: MonitoredStage["grade"],
	status: MonitoredStage["status"] = "graded",
): Promise<void> {
	const record = {
		...new RunRecordBuilder({
			run: RUN,
			stages: [
				new RunRecordStageBuilder({
					grade,

					judgeCost: { state: "available", usd: 0.22 },

					stage: "plan",

					status,
				}).build(),
				new RunRecordStageBuilder().build(),
			],
		}).build(),
		minimumGrade: { letter: "B-", state: "available" },
	};
	renderMonitor(
		new PipelineRunRowBuilder({ run: RUN })
			.withExecutionProgress({ stage: "build" })
			.build(),
		new Map<string, unknown>([
			[`/api/runs/${RUN}`, record],
			[PLAN_JUDGE, JUDGED],
		]),
	);
	await selectStage("plan");
}

const ACCEPTED_C = {
	letter: "C",
	reachesMinimum: true,
	state: "available",
	verdict: "CONTINUE",
} satisfies MonitoredStage["grade"];

async function judgePane(): Promise<HTMLElement> {
	return await screen.findByRole("region", { name: "Judge" });
}

function returningJudge(
	hardBlockers: { readonly returned: number; readonly total: number },
	dimensions: { readonly returned: number; readonly total: number },
): StageJudge {
	return {
		progress: {
			attempt: 1,
			sections: {
				dimensions,
				hardBlockers,
				requirements: { returned: 0, total: 1 },
			},
			state: "returning",
		},
		state: "returning",
	};
}

export {
	ACCEPTED_C,
	BUILD_JUDGE,
	JUDGED,
	PLAN_JUDGE,
	RETURNING,
	judgePane,
	judgeRowReadings,
	qualityReadings,
	renderJudge,
	renderJudged,
	returningJudge,
};
