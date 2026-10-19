interface CaseRecordId {
	readonly kind: "case";
	readonly caseId: string;
}

interface RunRecordId {
	readonly kind: "run";
	readonly run: string;
}

interface CheckpointRecordId {
	readonly kind: "checkpoint";
	readonly run: string;
	readonly stage: string;
}

interface SessionAttemptRecordId {
	readonly kind: "attempt:session";
	readonly caseId: string;
	readonly uuid: string;
}

interface StageAttemptRecordId {
	readonly kind: "attempt:stage";
	readonly lineage: string;
	readonly timestamp: string;
}

interface GroupRecordId {
	readonly kind: "group";
	readonly groupId: string;
}

interface RepStageRecordId {
	readonly kind: "rep:stage";
	readonly groupId: string;
	readonly repId: string;
	readonly stage: string;
}

interface RepSessionRecordId {
	readonly kind: "rep:session";
	readonly groupId: string;
	readonly repId: string;
}

interface ComparisonRecordId {
	readonly kind: "comparison";
	readonly manifestDigest: string;
}

type RecordId =
	| CaseRecordId
	| RunRecordId
	| CheckpointRecordId
	| SessionAttemptRecordId
	| StageAttemptRecordId
	| GroupRecordId
	| RepStageRecordId
	| RepSessionRecordId
	| ComparisonRecordId;

/**
 * A short id as typed: the case it was claimed in, the number the claim took,
 * and for a checkpoint the stage's position, 0 being the setup checkpoint.
 * Which record it names is the registry's answer, not the parser's.
 */
interface ShortIdReference {
	readonly kind: "short";
	readonly caseId: string;
	readonly shortKind: "run" | "group";
	readonly number: number;
	readonly stage?: number;
}

/**
 * A segment is interpolated into a path under the runs directory, so a value
 * satisfying the id's shape can still name a destination outside it: `run:..`
 * reads a sibling of `.benchmark-runs`, and `group:../../../../etc/passwd`
 * leaves the repository entirely. Shape is not destination, and refusing the
 * segment here means no caller can hold an id that escapes. The message names
 * the id as the caller typed it, because an id they never wrote tells them
 * nothing about which one to correct.
 */
interface IdBody {
	/** The id exactly as the caller typed it, which is what a refusal names. */
	readonly given: string;
	/** The form this prefix takes, which is what a malformed body is told. */
	readonly form: string;
	/** Everything after the prefix, which is what the segments come from. */
	readonly body: string;
}

/**
 * The one place a string becomes a record id. `show` holds the parsed value
 * and never asks which record a bare string named, and `formatRecordId` is its
 * inverse so every id a listing prints parses back to the value it came from.
 */

interface RecordBody {
	readonly given: string;
	readonly body: string;
}

interface QualifiedRecordId extends RecordBody {
	readonly prefix: string;
}

type RootRecordId =
	| CaseRecordId
	| RunRecordId
	| GroupRecordId
	| ComparisonRecordId;

export type {
	CaseRecordId,
	CheckpointRecordId,
	ComparisonRecordId,
	GroupRecordId,
	IdBody,
	QualifiedRecordId,
	RecordBody,
	RecordId,
	RepSessionRecordId,
	RepStageRecordId,
	RootRecordId,
	RunRecordId,
	SessionAttemptRecordId,
	ShortIdReference,
	StageAttemptRecordId,
};
