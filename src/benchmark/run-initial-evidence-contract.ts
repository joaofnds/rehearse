import type { CheckpointRecord, recordCheckpoint } from "./checkpoint";
import type { InitialRunCorpus } from "./run-initial-corpus";
import type { PreparedRunTask } from "./run-task";
import type { recordRetentionRef } from "./target";
import type { ProductOwner } from "./workflow";

interface InitialRunEvidence {
	readonly corpus: InitialRunCorpus;
	readonly task: PreparedRunTask;
	readonly initialCheckpoint: CheckpointRecord;
	readonly productOwner: ProductOwner;
	readonly retainCommit: typeof recordRetentionRef;
	readonly recordCheckpoint: typeof recordCheckpoint;
}
export type { InitialRunEvidence };
