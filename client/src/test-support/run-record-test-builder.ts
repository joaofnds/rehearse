import type { Immutable } from "#benchmark/contracts";
import type { RunRecord, RunRecordStage } from "#server/run-record";

import RunRecordStageBuilder from "./run-record-stage-test-builder";

const NOT_READ = {
	reasons: ["not read by this test"],
	state: "unavailable",
} as const;

type NamedStageChanges = Immutable<
	Partial<RunRecordStage> & Pick<RunRecordStage, "stage">
>;

class RunRecordBuilder {
	public constructor(
		private readonly props: Immutable<Partial<RunRecord>> = {},
	) {}

	public withStage(changes: NamedStageChanges): RunRecordBuilder {
		const record = this.build();
		if (!record.stages.some(({ stage }) => stage === changes.stage)) {
			throw new Error(`the fixture has no ${changes.stage} stage`);
		}

		const stages = record.stages.map((stage) =>
			stage.stage === changes.stage
				? new RunRecordStageBuilder({ ...stage, ...changes }).build()
				: stage,
		);

		return new RunRecordBuilder({ ...record, stages });
	}

	public build(): RunRecord {
		return {
			caseId: "audit-log",
			finalOutcome: { stage: "build", status: "PENDING" },
			identity: {
				commit: "e91f2a0c",
				corpusVersion: undefined,
				effort: "high",
				model: "claude-opus-4",
				target: "acme-api",
			},
			minimumGrade: NOT_READ,
			run: "2026-09-30T10-00-00.000Z",
			shortId: { shortId: "r-0148", state: "available" },
			stages: [],
			status: { state: "available", status: "RUNNING" },
			totals: {
				cost: NOT_READ,
				productOwnerCost: NOT_READ,
				tokens: NOT_READ,
				wallTime: NOT_READ,
			},
			...this.props,
		};
	}
}

export { RunRecordBuilder as default };
