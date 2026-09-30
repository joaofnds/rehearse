import type { RunRecord, RunRecordStage } from "#server/run-record";

const NOT_READ = {
	state: "unavailable",
	reasons: ["not read by this test"],
} as const;

/** A stage of a run record with every figure unread, for a test whose subject is another. */
export function recordStage(
	stage: string,
	props: Partial<Omit<RunRecordStage, "stage">> = {},
): RunRecordStage {
	return {
		stage,
		status: "no-record",
		grade: NOT_READ,
		wallTime: NOT_READ,
		sessionCost: NOT_READ,
		judgeCost: NOT_READ,
		tokens: NOT_READ,
		checkpoint: "missing",
		checkpointShortId: NOT_READ,
		instructionFiles: NOT_READ,
		corpusVersion: undefined,
		readManifest: NOT_READ,
		artifactsOut: {
			declared: NOT_READ,
			workflowState: NOT_READ,
			commitSubjects: NOT_READ,
			changedPaths: NOT_READ,
		},
		...props,
	};
}

/** A pipeline run's record, in flight at `running`, with the stages given in pipeline order. */
export function runRecord(props: {
	readonly run: string;
	readonly running: string;
	readonly stages: readonly RunRecordStage[];
}): RunRecord {
	return {
		run: props.run,
		shortId: { state: "available", shortId: "r-0148" },
		caseId: "audit-log",
		status: { state: "available", status: "RUNNING" },
		minimumGrade: NOT_READ,
		stages: props.stages,
		totals: {
			tokens: NOT_READ,
			cost: NOT_READ,
			productOwnerCost: NOT_READ,
			wallTime: NOT_READ,
		},
		finalOutcome: { status: "PENDING", stage: props.running },
	};
}
