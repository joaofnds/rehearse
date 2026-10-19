import NamedHistoryBuilder from "#client/run-history/run-history-page-named-history-builder";
import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";
import {
	RUN,
	RunRecordStageBuilder,
	stoppedAtBuild,
} from "#client/test-support/run-detail";

const FIRST_RECORDED_STAGE_INDEX = 0;

const originalFetch = globalThis.fetch;

const CONTEXT_BASE_RECORD = stoppedAtBuild();

const CONTEXT_BUILD_STAGE = new RunRecordStageBuilder({
	artifactsIn: {
		entries: [
			{
				checkpointShortId: {
					shortId: "audit-log/r7/s1",
					state: "available",
				},
				from: "upstream checkpoint",
				target: "acme-api",
				upstream: "shape",
			},
		],
		missing: [],
	},
	stage: "build",
	status: "stopped",
	tokens: {
		cacheRead: 4,
		cacheWrite: 5,
		input: 12,
		missing: [
			{
				part: "build judge",
				reason: "usage absent",
			},
		],
		output: 3,
		state: "available",
		totalInput: 21,
	},
}).build();

const PAUSED_BASE_RECORD = stoppedAtBuild();

const PAUSED_RUN_STAGES = PAUSED_BASE_RECORD.stages.map((stage) =>
	stage.stage === "build"
		? {
				...stage,
				checkpoint: "recorded",
				readManifest: {
					entries: [
						{
							evidence: "declared",
							half: "corpus",
							path: "skills/build/SKILL.md",
							role: "stage skill",
							sha256: "a".repeat(SHA256_HEX_CHARACTERS),
							state: "unchanged",
						},
					],
					state: "available",
				},
				status: "graded",
			}
		: stage,
);

const PAUSED_RUN_REPLIES = new Map<string, unknown>([
	[
		"/api/runs",
		new NamedHistoryBuilder({
			rows: [
				{
					...new PipelineRunRowBuilder({ run: RUN, status: "PAUSED:build" })
						.withExecutionProgress()
						.build(),
					replayableStages: ["build"],
				},
			],
		}).build(),
	],
	[
		`/api/runs/${RUN}`,
		{
			...PAUSED_BASE_RECORD,
			stages: PAUSED_RUN_STAGES,
			status: { state: "available", status: "PAUSED:build" },
		},
	],
]);

export {
	CONTEXT_BASE_RECORD,
	CONTEXT_BUILD_STAGE,
	FIRST_RECORDED_STAGE_INDEX,
	PAUSED_BASE_RECORD,
	PAUSED_RUN_REPLIES,
	PAUSED_RUN_STAGES,
	originalFetch,
};
