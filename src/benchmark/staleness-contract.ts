import type { ChangedCorpusFile, HashedFile, StageCorpus } from "./checkpoint";
import type { Effort } from "./config";
import type { CorpusRoot } from "./corpus-file";
import type { VersionDistance } from "./corpus-version";
import type { StageDefinition } from "./pipeline";
import type { ReadManifestEntry } from "./read-manifest";

/**
 * One record judged against the corpus under test, stale or clean, with the
 * corpus files it read that changed and how many versions behind it sits.
 * Stale or clean comes from the causes, never from the distance.
 */
interface RecordStaleness {
	/** The id `show` accepts back. */
	readonly id: string;
	readonly stale: boolean;
	/** Every reason it went stale, empty when it is clean. */
	readonly causes: readonly string[];
	readonly changedFiles: readonly ChangedCorpusFile[];
	/**
	 * Stale only because corpus files changed, among them one it read, which
	 * is what a reader can count in versions.
	 */
	readonly onlyCorpusFiles: boolean;
	readonly distance: VersionDistance;
	/** The corpus files it read, each with the hash it recorded. */
	readonly readFiles: readonly HashedFile[];
	/**
	 * What it declared and loaded, each corpus and rubric entry with a
	 * recorded hash saying whether that file changed since. Empty for a record
	 * written before read manifests.
	 */
	readonly readManifest: readonly JudgedReadEntry[];
}

type JudgedReadEntry = ReadManifestEntry & {
	readonly state?: "unchanged" | "changed";
};

type JudgedReads = CorpusChanges &
	Pick<RecordStaleness, "readFiles" | "readManifest">;

interface CurrentStageReading {
	readonly current: StageCorpus;
	readonly source: CorpusRoot;
	readonly definition: StageDefinition | undefined;
}

interface UnreadableStaleRecord {
	readonly id: string;
	readonly reason: string;
}

interface StalenessReport {
	readonly records: readonly RecordStaleness[];
	readonly unreadable: readonly UnreadableStaleRecord[];
}

/**
 * The model and effort the session is about to replay with, which is what a
 * recorded checkpoint is compared against. Comparing a checkpoint to the
 * manifest that produced it answers the question tautologically, so a knob the
 * caller did not name asserts nothing: the run's own value stands in and that
 * half of the comparison stays silent, while a named one reports exactly what
 * `replay` would report for the same flags.
 */
interface CurrentSessionKnobs {
	readonly model?: string | undefined;
	readonly effort?: Effort | undefined;
}

type CorpusChanges = Pick<RecordStaleness, "causes" | "changedFiles">;

export type {
	RecordStaleness,
	JudgedReadEntry,
	UnreadableStaleRecord,
	StalenessReport,
	CurrentSessionKnobs,
	CurrentStageReading,
	JudgedReads,
	CorpusChanges,
};
