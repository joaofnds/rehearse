import type { RunRecordResponse } from "#client/monitor/run-record-query";
import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import {
	RunRecordBuilder,
	RunRecordStageBuilder,
} from "#client/test-support/run-detail";

import type { PipelineRow } from "./monitor-test-fixtures";
import { RUN } from "./monitor-test-fixtures";

const NEWER = "2026-09-30T11-00-00.000Z";

const completed = new PipelineRunRowBuilder({ run: RUN, status: "COMPLETED" })
	.withExecutionProgress()
	.build();

const completedRecord: RunRecordResponse = {
	...new RunRecordBuilder({
		run: RUN,
		stages: [
			new RunRecordStageBuilder({
				stage: "plan",
				status: "graded",
			}).build(),
			new RunRecordStageBuilder({
				stage: "build",
				status: "graded",
			}).build(),
		],
	}).build(),
	finalOutcome: { status: "JUDGED", verdict: "PASS" },
};

function newerRow(): PipelineRow {
	return {
		...new PipelineRunRowBuilder({ run: NEWER })
			.withExecutionProgress({ stage: "build" })
			.build(),
		shortId: "r-0149",
	};
}

export { completed, completedRecord, newerRow };
