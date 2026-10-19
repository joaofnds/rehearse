/** Which attempt at its checkpoint a record is: "attempt 2 of 3". */
interface AttemptPosition {
	readonly position: number;
	readonly count: number;
}

/** Which record an attempt at a checkpoint is. */
type CheckpointAttempt =
	| { readonly kind: "original" }
	| {
			readonly kind: "replay";
			readonly lineage: string;
			readonly timestamp: string;
	  }
	| {
			readonly kind: "rep";
			readonly groupId: string;
			readonly repId: string;
			readonly ordinal: number;
	  };

/**
 * One run of a stage from the checkpoint before it, ordered by claim number
 * and, inside a confirmation group, by the rep's position in it.
 */
interface ClaimedAttempt {
	readonly attempt: CheckpointAttempt;
	readonly claim: number;
	readonly ordinal: number;
}

interface ClaimedAttempts {
	readonly runClaims: ReadonlyMap<string, number>;
	readonly byCheckpoint: ReadonlyMap<
		string,
		{
			readonly run: string;
			readonly stage: string;
			readonly attempts: readonly ClaimedAttempt[];
		}
	>;
}

interface CheckpointIdentity {
	readonly run: string;
	readonly stage: string;
}

export type {
	AttemptPosition,
	CheckpointAttempt,
	ClaimedAttempt,
	ClaimedAttempts,
	CheckpointIdentity,
};
