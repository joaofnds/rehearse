import { INITIAL_CHECKPOINT_STAGE } from "#benchmark/checkpoint";
import { unhandled } from "#benchmark/contracts";
import { withRecordReadScope } from "#benchmark/record-read-scope";
import type { RunLiveness } from "#benchmark/run-liveness";
import { formatRecordId } from "#cli/record-id";
import type {
	RunHistoryCorpus,
	RunHistoryReport,
	RunHistoryRow,
	RunListing,
	RunListingRow,
	Staleness,
} from "#server/run-history-contract";
import readRunListing from "#server/run-history-read-run-listing";
import recordStaleness from "#server/run-history-record-staleness";

/**
 * Every row `runListing` renders, each with its staleness recomputed against
 * `source` on every call rather than cached: a stale badge that is silently
 * wrong is worse than the cost of hashing the corpus. A record whose
 * staleness cannot be judged, a corpus file it cannot resolve among them,
 * shows that staleness as unavailable rather than failing the report.
 *
 * Given `only`, the report holds just the records with those ids, such as
 * the rows the corpus report says the last edit invalidated.
 */
async function runHistoryReport(
	{ runsDirectory, source }: RunHistoryCorpus,
	liveness: RunLiveness,
	only?: ReadonlySet<string>,
): Promise<RunHistoryReport> {
	const [staleness, listing] = await Promise.all([
		recordStaleness(runsDirectory, source),
		runListing(runsDirectory, liveness, only),
	]);

	return {
		...listing,
		rows: listing.rows.map((row) => withStaleness(row, staleness)),
	};
}

function withStaleness(
	row: RunListingRow,
	staleness: Staleness,
): RunHistoryRow {
	switch (row.kind) {
		case "run": {
			return {
				...row,
				staleness: staleness.ofRun(
					row.run,
					formatRecordId({
						kind: "checkpoint",
						run: row.run,
						stage: row.stage ?? INITIAL_CHECKPOINT_STAGE,
					}),
				),
			};
		}
		case "session-attempt":
		case "replay":
		case "group": {
			return { ...row, staleness: staleness.of(row.recordId) };
		}
		default: {
			return unhandled(row, "run history row kind");
		}
	}
}

/**
 * Every recorded run rendered as a row, as `runHistoryReport` renders it but
 * without judging any record's staleness, so it hashes neither the corpus
 * under test nor the files a record's read manifest names.
 *
 * One run's failure to read, a malformed artifact or a missing manifest, is
 * collected rather than thrown: the `list runs` precedent
 * (`src/cli/list-command.ts`'s `collect`) is what this follows, so a single
 * bad run cannot blank the whole response the way an uncaught throw would.
 * The reason is redacted the same way, since a filesystem error can name a
 * path under the corpus root or the target repository, neither of which
 * lives under `CONTROL_DIR`.
 */
async function runListing(
	runsDirectory: string,
	liveness: RunLiveness,
	only?: ReadonlySet<string>,
): Promise<RunListing> {
	return await withRecordReadScope(
		async () => await readRunListing(runsDirectory, liveness, only),
	);
}

export { runHistoryReport, runListing };
export type { ContextLink, RunProgress } from "#server/run-status";
export { default as UNJUDGED_REASON } from "#server/row-staleness";
export type { RowStaleness } from "#server/row-staleness";
export {
	NO_GRADED_BLOCKERS_REASON,
	SESSION_BLOCKERS_REASON,
} from "#server/run-history-group-fired-blockers";
export {
	REPLAY_FINAL_OUTCOME_REASON,
	REPLAY_WALL_TIME_REASON,
	SOURCE_MANIFEST_REASON,
} from "#server/run-history-replay-row";
export {
	SESSION_COST_REASON,
	NO_REPLY_CHECKS_REASON,
	EXECUTION_FAILED_CHECKS_REASON,
} from "#server/run-history-session-attempt-row";
export { NO_MANIFEST_REASON } from "#server/run-history-run-figures";
export { UNLISTED_STAGE_REASON } from "#server/run-history-stages-around";
export {
	NO_FROZEN_PIPELINE_REASON,
	UNREADABLE_FROZEN_PIPELINE_REASON,
	SESSION_PIPELINE_REASON,
} from "#server/run-history-group-pipeline-stages";
export { default as liveLaunches } from "#server/run-history-live-launches";
export { default as recordStaleness } from "#server/run-history-record-staleness";
export { default as runStalenessReport } from "#server/run-history-run-staleness-report";
export type {
	PipelineRunRow,
	FiredBlockers,
	PipelineStages,
	ListedStageGrade,
	SessionAttemptRow,
	ReplayRow,
	NotApplicable,
	ConfirmationGroupRow,
	SessionGroupSavedState,
	LaunchRow,
	RepAttempt,
	RunHistoryRow,
	RunListingRow,
	CheckpointShortId,
	UnreadableRecord,
	RunHistoryReport,
	RunListing,
	Staleness,
} from "#server/run-history-contract";
