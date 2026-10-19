import type { CorpusRoot } from "./corpus-file";
import { withCorpusReadScope } from "./corpus-read-scope";
import { readCorpusUnderTest } from "./corpus-version";
import { runCheckpointStaleness } from "./staleness-checkpoint-history";
import {
	checkpointReport,
	checkpointStalenessAgainst,
} from "./staleness-checkpoints";
import type { CheckpointStalenessByRun } from "./staleness-checkpoints";
import type {
	CurrentSessionKnobs,
	RecordStaleness,
	StalenessReport,
} from "./staleness-contract";
import { corpusJudgedAgainst } from "./staleness-current-corpus";
import type { CorpusUnderTestReader } from "./staleness-current-corpus";
import groupStalenessAgainst from "./staleness-groups";
import replayAttemptStalenessAgainst from "./staleness-replay-attempts";
import sessionAttemptStalenessAgainst from "./staleness-session-attempts";

/**
 * Staleness needs the corpus hashed, never installed, so `stale` needs no
 * worktree, no git, and no session: `captureStageCorpus` reads the roots it is
 * given and nothing else, and those roots are the ones a replay against the
 * same corpus would search.
 *
 * Every checkpoint of every recorded run, and the stage its judge stopped
 * under the run's id, judged against the corpus under test. A run with no manifest contributes nothing rather than failing the
 * report: it was never replayable, so nothing about it can go stale. A run
 * whose manifest or checkpoints do not parse is unreadable under its run id,
 * so one bad record cannot blank every reader of the report.
 *
 * The instruction file is read once for the whole report rather than once per
 * run: the corpus under test does not change between runs, so one read answers
 * for all of them and a refusal is decided in one place.
 */
async function checkpointStaleness(
	runsDirectory: string,
	source: CorpusRoot,
	knobs: CurrentSessionKnobs = {},
): Promise<StalenessReport> {
	return checkpointReport(
		await checkpointStalenessAgainst(
			runsDirectory,
			await corpusJudgedAgainst(runsDirectory, source, readCorpusUnderTest),
			knobs,
		),
	);
}

/**
 * One run's checkpoints judged as `checkpointStaleness` judges them, none when
 * the run recorded no manifest.
 */
async function checkpointStalenessOfRun(
	runsDirectory: string,
	run: string,
	source: CorpusRoot,
): Promise<readonly RecordStaleness[]> {
	const judged = await runCheckpointStaleness(
		{ run, runsDirectory },
		await corpusJudgedAgainst(runsDirectory, source, readCorpusUnderTest),
		{},
	);

	return judged?.records ?? [];
}

/** The readable checkpoints `checkpointStaleness` finds stale, and only those. */
async function staleCheckpoints(
	runsDirectory: string,
	source: CorpusRoot,
	knobs: CurrentSessionKnobs = {},
): Promise<readonly RecordStaleness[]> {
	const report = await checkpointStaleness(runsDirectory, source, knobs);

	return report.records.filter(({ stale }) => stale);
}

/**
 * Every session attempt judged against the corpus under test, each on its
 * own: an older attempt of a case is a result on the run history as much as
 * the newest one, and its distance differs. An attempt is stale when a corpus
 * file its case declares changed since it was recorded.
 *
 * A record that does not read is named rather than dropped, since one
 * half-written attempt must not hide every other answer. So is a declaration
 * that does not read: silence there is indistinguishable from fresh, and a
 * mistyped `corpusFiles` entry would then read as an answer.
 */
async function sessionAttemptStaleness(
	runsDirectory: string,
	source: CorpusRoot,
): Promise<StalenessReport> {
	return await sessionAttemptStalenessAgainst(runsDirectory, {
		source,
		underTest: await readCorpusUnderTest(runsDirectory, source),
	});
}

/**
 * Every stage replay judged against the corpus under test. A replay is stale
 * when a corpus file its stage read changed, when the checkpoint it consumed
 * went stale, or when the caller names a model or effort it did not run with.
 * The consumed checkpoint is judged with its own run's knobs: a knob the
 * caller names is compared against the replay's own value once, rather than
 * again through every checkpoint upstream of it. A settings change needs no
 * cause of its own here, since it stales the consumed checkpoint and reaches
 * the replay as that upstream cause.
 */
async function replayAttemptStaleness(
	runsDirectory: string,
	source: CorpusRoot,
	knobs: CurrentSessionKnobs = {},
): Promise<StalenessReport> {
	return await replayAttemptStalenessAgainst(
		runsDirectory,
		await corpusJudgedAgainst(runsDirectory, source, readCorpusUnderTest),
		{ knobs, upstream: await checkpointStaleness(runsDirectory, source) },
	);
}

/**
 * Every confirmation group judged against the corpus under test by the corpus
 * files it froze and the reads its reps recorded, a changed judge rubric
 * included. A group froze its checkpoint and pipeline too, so nothing
 * upstream of it in the live run records can stale it, and its settings are
 * compared by the checkpoint it froze rather than here.
 */
async function groupStaleness(
	runsDirectory: string,
	source: CorpusRoot,
	knobs: CurrentSessionKnobs = {},
): Promise<StalenessReport> {
	return await groupStalenessAgainst(
		runsDirectory,
		await corpusJudgedAgainst(runsDirectory, source, readCorpusUnderTest),
		knobs,
	);
}

/** Every record kind's staleness, judged with the knobs each was recorded with. */
interface EveryRecordStaleness {
	readonly checkpoints: CheckpointStalenessByRun;
	readonly sessionAttempts: StalenessReport;
	readonly replayAttempts: StalenessReport;
	readonly groups: StalenessReport;
}

/**
 * Every record's staleness against one reading of the corpus under test, each
 * checkpoint judged once: a replay's upstream stages are the checkpoints
 * judged here.
 */
async function everyRecordStaleness(
	runsDirectory: string,
	source: CorpusRoot,
	readUnderTest: CorpusUnderTestReader = readCorpusUnderTest,
): Promise<EveryRecordStaleness> {
	return await withCorpusReadScope(async () => {
		const against = await corpusJudgedAgainst(
			runsDirectory,
			source,
			readUnderTest,
		);
		const checkpoints = await checkpointStalenessAgainst(
			runsDirectory,
			against,
			{},
		);

		const sessionAttempts = await sessionAttemptStalenessAgainst(
			runsDirectory,
			against,
		);
		const replayAttempts = await replayAttemptStalenessAgainst(
			runsDirectory,
			against,
			{ knobs: {}, upstream: checkpointReport(checkpoints) },
		);
		const groups = await groupStalenessAgainst(runsDirectory, against, {});

		return {
			checkpoints,
			groups,
			replayAttempts,
			sessionAttempts,
		};
	});
}

export { judgeRubricCause } from "./staleness-rubrics";

export { chainRubricCauses } from "./staleness-read-manifest";

export { stopRecordReadsSchema } from "./staleness-checkpoint-history";

export { checkpointReport } from "./staleness-checkpoints";

export { default as judgedStageReads } from "./staleness-stage-reads";

export { frozenPipeline } from "./staleness-frozen-corpus";

export { groupRepReads, recordedRepReads } from "./staleness-group-reads";

export type {
	RecordStaleness,
	JudgedReadEntry,
	UnreadableStaleRecord,
	StalenessReport,
	CurrentSessionKnobs,
} from "./staleness-contract";

export type { CheckpointStalenessByRun } from "./staleness-checkpoints";

export type { CorpusUnderTestReader } from "./staleness-current-corpus";

export type { RepReads, GroupRepReads } from "./staleness-group-reads";

export {
	checkpointStaleness,
	checkpointStalenessOfRun,
	staleCheckpoints,
	sessionAttemptStaleness,
	replayAttemptStaleness,
	groupStaleness,
	everyRecordStaleness,
};

export type { EveryRecordStaleness };
