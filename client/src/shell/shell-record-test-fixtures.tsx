import type { ComparisonIndexResponse } from "#client/comparison/comparison-index-query";
import type { CorpusResponse } from "#client/corpus/corpus-query";
import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";
import {
	UNREAD_RUN_FIGURES,
	UNREAD_SESSION_ATTEMPT_FIGURES,
	UNREAD_STALENESS,
	unversionedStaleness,
} from "#client/test-support/run-figures";

const DIGEST_PAIR_REPETITIONS = 32;

const NO_SERVED_RUNS = 0;

const NO_SERVED_CORPUS_FILES = 0;

const NO_SERVED_COMPARISONS = 0;

const NO_SERVED_UNREADABLE_COMPARISONS = 0;

const NO_SERVED_SESSION_ATTEMPTS = 0;

type RunHistoryRow = RunHistoryResponse["rows"][number];

type CorpusFile = CorpusResponse["files"][number];

type SavedComparison = ComparisonIndexResponse["comparisons"][number];

function runRow(run: string): RunHistoryRow {
	return {
		kind: "run",
		recordId: `run:${run}`,
		...UNREAD_RUN_FIGURES,
		caseId: "audit-log",
		checkpoints: [],
		corpusChangedDuringRun: false,
		corpusVersion: { digest: "a3a62f", kind: "version" },
		grade: "B",
		launchId: undefined,
		links: [],
		progress: { state: "recorded" },
		run,
		shortId: undefined,
		stage: "build",
		staleness: unversionedStaleness({ causes: [], stale: false }),
		status: "COMPLETE",
	};
}

function sessionAttemptRow(uuid: string): RunHistoryRow {
	return {
		corpusVersion: undefined,
		kind: "session-attempt",
		recordId: `attempt:session:brief-reply/${uuid}`,
		staleness: UNREAD_STALENESS,
		...UNREAD_SESSION_ATTEMPT_FIGURES,
		caseId: "brief-reply",
		links: [],
		shortId: undefined,
		status: "UNSUCCESSFUL",
		uuid,
	};
}

function savedComparison(digest: string): SavedComparison {
	return { caseIds: ["audit-log"], digest, mode: "session", reps: 2 };
}

function corpusFile(path: string): CorpusFile {
	return {
		invalidated: 0,
		lastEditedAt: "2026-09-22T09:12:00.000Z",
		lines: 1,
		path,
		readBy: 0,
		sha256: "a".repeat(SHA256_HEX_CHARACTERS),
	};
}

interface ServedShellCollections {
	readonly runs: number;
	readonly sessionAttempts?: number;
	readonly corpusFiles: number;
	readonly comparisons?: number;
	readonly unreadableComparisons?: number;
}

function shellCorpus(corpusFiles: number): CorpusResponse {
	return {
		digest: "ffd58d".padEnd(SHA256_HEX_CHARACTERS, "0"),
		files: Array.from({ length: corpusFiles }, (_unused, index) =>
			corpusFile(`file-${index}.md`),
		),
		lastEdit: { kind: "not-recorded", reason: "no earlier version" },
		refusals: [],
		root: "/corpus",
	} satisfies CorpusResponse;
}

function shellComparisons(
	comparisons: number,
	unreadableComparisons: number,
): ComparisonIndexResponse {
	return {
		comparisons: Array.from({ length: comparisons }, (_unused, index) =>
			savedComparison(String(index).repeat(SHA256_HEX_CHARACTERS)),
		),
		unreadable: Array.from(
			{ length: unreadableComparisons },
			(_unused, index) => ({
				id: `f${index}`.repeat(DIGEST_PAIR_REPETITIONS),
				reason: "JSON Parse error",
			}),
		),
	};
}

export {
	corpusFile,
	NO_SERVED_COMPARISONS,
	NO_SERVED_CORPUS_FILES,
	NO_SERVED_RUNS,
	NO_SERVED_SESSION_ATTEMPTS,
	NO_SERVED_UNREADABLE_COMPARISONS,
	runRow,
	sessionAttemptRow,
	shellComparisons,
	shellCorpus,
};

export type { ServedShellCollections };
