import type {
	SessionAttemptIdentity,
	StageHistoryIdentity,
} from "./session-history-contract";

const sessionAttempt: SessionAttemptIdentity = {
	caseId: "case-a",
	corpusFiles: [],
	id: "attempt-a",
	kind: "session",
	model: "sonnet",
	outcome: "SUCCESSFUL",
};

const stageAttempt: StageHistoryIdentity = {
	caseId: "case-a",
	corpusFiles: [],
	kind: "stage",
	lineage: "lineage-1",
	model: "sonnet",
	run: "run-1",
	stage: "shape",
	upstream: "upstream-1",
};

export { sessionAttempt, stageAttempt };
