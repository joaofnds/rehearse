import { expect, setSystemTime } from "bun:test";

import { screen, waitFor } from "@testing-library/react";

import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import {
	RunRecordBuilder,
	RunRecordStageBuilder,
} from "#client/test-support/run-detail";
import type { StageTimes } from "#server/stage-times";

import { RUN, renderMonitor } from "./monitor-test-fixtures";

/** The run measured 6m12s at its latest event, a minute before the clock reads. */
const MEASURED_AT = "2026-09-30T10:06:12.000Z";

function renderMeasuredRun(): void {
	setSystemTime(new Date("2026-09-30T10:07:12.000Z"));
	renderMonitor(
		new PipelineRunRowBuilder({ run: RUN })
			.withExecutionProgress({
				ceilingUsd: 20,
				elapsedMs: 372_000,
				measuredAt: MEASURED_AT,
				runSpentUsd: 1.83,
			})
			.build(),
	);
}

const THREE_STAGE_RECORD = new RunRecordBuilder({
	run: RUN,
	stages: [
		new RunRecordStageBuilder({
			stage: "plan",
			status: "graded",
		}).build(),
		new RunRecordStageBuilder().build(),
		new RunRecordStageBuilder({ stage: "review" }).build(),
	],
}).build();

/** Earlier runs of the case took a median 6m40s in build and 2m in review. */
const EARLIER_TIMES: StageTimes = {
	stages: [
		{ medianMs: 90_000, stage: "plan", state: "available" },
		{ medianMs: 400_000, stage: "build", state: "available" },
		{ medianMs: 120_000, stage: "review", state: "available" },
	],
};

/** Waits for the figure, which reads a second query after the band shows. */
async function expectEstimate(text: string): Promise<void> {
	const shown = await spendBand();
	await waitFor(() => {
		expect(shown).toHaveTextContent(text);
	});
}

/** The clock reads a minute after the run's latest event, as in the band's other tests. */
interface EstimatedRunFixture {
	readonly stageElapsedMs: number;
}

function renderEstimatedRun(
	{ stageElapsedMs }: EstimatedRunFixture,
	times: StageTimes = EARLIER_TIMES,
): void {
	setSystemTime(new Date("2026-09-30T10:07:12.000Z"));
	renderMonitor(
		new PipelineRunRowBuilder({ run: RUN })
			.withExecutionProgress({
				ceilingUsd: 20,
				elapsedMs: 372_000,
				measuredAt: MEASURED_AT,
				runSpentUsd: 1.83,
				stageElapsedMs,
			})
			.build(),
		new Map<string, unknown>([
			[`/api/runs/${RUN}`, THREE_STAGE_RECORD],
			[`/api/runs/${RUN}/stage-times`, times],
		]),
	);
}

async function spendBand(): Promise<HTMLElement> {
	return await screen.findByRole("region", { name: "Spend" });
}

export {
	EARLIER_TIMES,
	MEASURED_AT,
	THREE_STAGE_RECORD,
	expectEstimate,
	renderEstimatedRun,
	renderMeasuredRun,
	spendBand,
};
