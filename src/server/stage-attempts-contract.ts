import type { CorpusMeasurement } from "#benchmark/corpus-measurement";

import type { RowStaleness, Staleness } from "./run-history";

/**
 * The original run's stage. Its grade and corpus version are the run
 * record's, which the page already holds, so only its staleness is read here.
 */
interface OriginalAttempt {
	readonly kind: "original";
	readonly id: string;
	readonly href?: string;
	readonly staleness: RowStaleness;
}

/** A replay or a judged rep of a stage-mode group, with what it recorded. */
interface RecordedAttempt {
	readonly kind: "replay" | "rep";
	readonly id: string;
	readonly href?: string;
	readonly grade: string | undefined;
	readonly corpusVersion: CorpusMeasurement | undefined;
	readonly staleness: RowStaleness;
}

type StageAttempt = OriginalAttempt | RecordedAttempt;

/**
 * Every attempt at the checkpoint a run's stage started from (SPEC.md 4a),
 * the checkpoint named by its short id where its run claimed one and by its
 * Record ID otherwise.
 */
interface StageAttempts {
	readonly checkpoint: string;
	readonly attempts: readonly StageAttempt[];
}

interface Lookup {
	readonly runsDirectory: string;
	readonly run: string;
	readonly stage: string;
	readonly shortIds: ReadonlyMap<string, string>;
	readonly staleness: Staleness;
}

export type {
	OriginalAttempt,
	RecordedAttempt,
	StageAttempt,
	StageAttempts,
	Lookup,
};
