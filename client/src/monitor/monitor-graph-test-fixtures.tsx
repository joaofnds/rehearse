import type { CorpusMeasurement } from "#benchmark/corpus-measurement";
import type { RunRecordResponse } from "#client/monitor/run-record-query";
import NamedHistoryBuilder from "#client/run-history/run-history-page-named-history-builder";
import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";
import {
	RunRecordBuilder,
	RunRecordStageBuilder,
} from "#client/test-support/run-detail";
import type { AnalysisReading } from "#server/root-cause-analyses";
import type { RunRecordStage } from "#server/run-record";

import { RUN, renderAppWithStub } from "./monitor-test-fixtures";

const PLAN_GRADED_STAGE = new RunRecordStageBuilder({
	grade: {
		letter: "B+",
		reachesMinimum: true,
		state: "available",
		verdict: "PASS",
	},

	stage: "plan",

	status: "graded",
}).build();

const PRODUCED_NOTE =
	"A step shows what its record says it produced until an analysis of the ended run gives one agent's reading of its contribution to the task's final grade.";

const DIGEST = "a41c7e".padEnd(SHA256_HEX_CHARACTERS, "0");

const MINIMUM_B_MINUS: RunRecordResponse["minimumGrade"] = {
	letter: "B-",
	state: "available",
};

function renderGraph(
	stages: readonly RunRecordStage[],
	{
		runUnder,
		analyses = new Map([
			[
				`/api/runs/${RUN}/analyses`,
				{
					earlierCount: 0,
					newest: null,
					request: { capUsd: 1, model: "sonnet", refusal: null },
					run: RUN,
					unreadable: [],
				},
			],
		]),
		minimumGrade = MINIMUM_B_MINUS,
	}: GraphRunEvidence = {},
): void {
	const fetchReplies = new Map<string, unknown>([
		...analyses,
		[
			"/api/run-listing",
			new NamedHistoryBuilder({
				rows: [
					new PipelineRunRowBuilder({ corpusVersion: runUnder, run: RUN })
						.withExecutionProgress({ stage: "build" })
						.build(),
				],
			}).build(),
		],
		[
			`/api/runs/${RUN}`,
			{
				...new RunRecordBuilder({ run: RUN, stages }).build(),
				minimumGrade,
			},
		],
	]);
	renderAppWithStub("/monitor", fetchReplies);
}

interface GraphRunEvidence {
	readonly runUnder?: CorpusMeasurement | undefined;
	readonly analyses?: ReadonlyMap<string, AnalysisReading> | undefined;
	readonly minimumGrade?: RunRecordResponse["minimumGrade"] | undefined;
}

const CONTRIBUTION_ANALYSES: GraphRunEvidence["analyses"] = new Map([
	[
		`/api/runs/${RUN}/analyses`,
		{
			earlierCount: 0,
			newest: {
				bundleBytes: 1200,
				bundleDigest: "b".repeat(SHA256_HEX_CHARACTERS),
				capUsd: 1,
				durationMs: 41_000,
				model: "sonnet",
				narrative: "No step stands out.",
				outcome: "recorded",
				pairedRerun: "None needed.",
				rootCause: null,
				run: RUN,
				schemaVersion: 2,
				stages: [
					{
						contribution: "left the scope the judge read open",
						note: "Plan left the scope open.",
						role: "contributing factor",
						stage: "plan",
					},
					{ role: "never ran", stage: "build" },
				],
				startedAt: "2026-09-30T10:30:00.000Z",
			},
			request: { capUsd: 1, model: "sonnet", refusal: null },
			run: RUN,
			unreadable: [],
		},
	],
]);

export {
	CONTRIBUTION_ANALYSES,
	DIGEST,
	PLAN_GRADED_STAGE,
	PRODUCED_NOTE,
	renderGraph,
};
