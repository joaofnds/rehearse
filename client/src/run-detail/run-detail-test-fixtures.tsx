import {
	RUN,
	RunRecordBuilder,
	RunRecordStageBuilder,
	judgedStaleness,
} from "#client/test-support/run-detail";

const originalFetch = globalThis.fetch;

const MOVING_RUN_RECORDS = new Map([
	[
		"build",
		new RunRecordBuilder({
			run: RUN,
			stages: [
				new RunRecordStageBuilder({
					stage: "shape",
					status: "graded",
				}).build(),
				new RunRecordStageBuilder().build(),
				new RunRecordStageBuilder({ stage: "verify" }).build(),
			],
		}).build(),
	],
	[
		"verify",
		new RunRecordBuilder({
			finalOutcome: { stage: "verify", status: "PENDING" },
			run: RUN,
			stages: [
				new RunRecordStageBuilder({
					stage: "shape",
					status: "graded",
				}).build(),
				new RunRecordStageBuilder({
					stage: "build",
					status: "graded",
				}).build(),
				new RunRecordStageBuilder({ stage: "verify" }).build(),
			],
		}).build(),
	],
]);

const MOVING_ATTEMPTS_RECORD = new RunRecordBuilder({
	run: RUN,
	stages: [
		new RunRecordStageBuilder({
			stage: "shape",
			status: "graded",
		}).build(),
		new RunRecordStageBuilder().build(),
		new RunRecordStageBuilder({ stage: "verify" }).build(),
	],
}).build();

const MOVING_CHECKPOINT_ATTEMPTS = new Map([
	["build", { attempts: [], checkpoint: "c-0147-1" }],
	[
		"verify",
		{
			attempts: [
				{
					id: "r-0147",
					kind: "original",
					staleness: judgedStaleness(false),
				},
			],
			checkpoint: "c-0147-1",
		},
	],
]);

export {
	MOVING_ATTEMPTS_RECORD,
	MOVING_CHECKPOINT_ATTEMPTS,
	MOVING_RUN_RECORDS,
	originalFetch,
};
