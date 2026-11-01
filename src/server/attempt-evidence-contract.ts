import type { z } from "zod";

import type { Immutable } from "#benchmark/contracts";
import type { SessionJudgeRecord } from "#benchmark/session-judge-contract";
import type { SessionAttemptRecord } from "#benchmark/session-record";
import type { RecordId } from "#cli/record-id";
import type {
	SavedStageOutput,
	StepAssessment,
	scorecardEvidenceSchema,
} from "#server/evidence-projection";
import type { RecordedEvidenceFile } from "#server/session-history-reader";

const STATE_GRADING_SESSION_RECORD_VERSION = 3;

type SessionJudgeEvidence =
	| Omit<
			Extract<SessionJudgeRecord, { status: "GRADED" }>,
			"attempts" | "providerCalls"
	  >
	| Omit<
			Extract<SessionJudgeRecord, { status: "ERROR" | "UNAVAILABLE" }>,
			"attempts" | "providerCalls"
	  >;

interface SessionEvidence {
	readonly caseId: string;
	readonly outcome: SessionAttemptRecord["outcome"];
	readonly reply?: string | undefined;
	readonly error?: string | undefined;
	readonly checks: Immutable<SessionAttemptRecord["checks"]>;
	readonly judge?: SessionJudgeEvidence | undefined;
	readonly stateResults?: Immutable<
		Extract<
			SessionAttemptRecord,
			{ schemaVersion: typeof STATE_GRADING_SESSION_RECORD_VERSION }
		>["stateResults"]
	>;
	readonly stateGradingError?: string | undefined;
}

type AttemptEvidenceReport =
	| { readonly state: "unavailable"; readonly reason: string }
	| {
			readonly state: "available";
			readonly kind: "session";
			readonly record: SessionEvidence;
	  }
	| {
			readonly state: "available";
			readonly kind: "stage";
			readonly stage: string;
			readonly output: SavedStageOutput;
			readonly diff?: string | undefined;
			readonly completionReply?: string | undefined;
			readonly assessment: StepAssessment;
	  };

type ScorecardEvidence = Extract<AttemptEvidenceReport, { kind: "stage" }>;

type AttemptEvidenceIdentity = Extract<
	RecordId,
	{
		readonly kind:
			| "attempt:session"
			| "attempt:stage"
			| "rep:session"
			| "rep:stage";
	}
>;

interface AttemptEvidenceInput {
	readonly root: string;
	readonly id: AttemptEvidenceIdentity;
	readonly saved: RecordedEvidenceFile;
}

interface GroupAttemptIndex {
	readonly groupId: string;
	readonly caseId: string;
	readonly repRecords: readonly {
		readonly repId: string;
		readonly ordinal: number;
	}[];
}

interface RepStageEvidence {
	readonly saved: RecordedEvidenceFile;
	readonly scorecard: Immutable<z.output<typeof scorecardEvidenceSchema>>;
}

export type {
	SessionEvidence,
	SessionJudgeEvidence,
	AttemptEvidenceReport,
	ScorecardEvidence,
	AttemptEvidenceInput,
	GroupAttemptIndex,
	AttemptEvidenceIdentity,
	RepStageEvidence,
};
