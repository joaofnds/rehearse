import type { Immutable } from "#benchmark/contracts";
import type { RunRecordStage } from "#server/run-record";

const NOT_READ = {
	reasons: ["not read by this test"],
	state: "unavailable",
} as const;

class RunRecordStageBuilder {
	public constructor(
		private readonly props: Immutable<Partial<RunRecordStage>> = {},
	) {}

	public build(): RunRecordStage {
		return {
			artifactsIn: { entries: [], missing: [] },
			artifactsOut: {
				changedPaths: NOT_READ,
				commitSubjects: NOT_READ,
				declared: NOT_READ,
				workflowState: NOT_READ,
			},
			blockers: NOT_READ,
			checkpoint: "missing",
			checkpointShortId: NOT_READ,
			corpusVersion: undefined,
			grade: NOT_READ,
			instructionFiles: NOT_READ,
			judgeCost: NOT_READ,
			readManifest: NOT_READ,
			sessionCost: NOT_READ,
			stage: "build",
			status: "no-record",
			tokens: NOT_READ,
			wallTime: NOT_READ,
			...this.props,
		};
	}
}

export { RunRecordStageBuilder as default };
