import { loadRunManifest } from "#benchmark/manifest";
import { readReplayRecord } from "#benchmark/replay";
import type { ReplayRecord } from "#benchmark/replay";
import { benchmarkRunPaths, replayRecordFile } from "#benchmark/run-layout";
import type { StageAttemptId } from "#benchmark/run-layout";
import { formatRecordId } from "#cli/record-id";
import { checkpointShortId } from "#cli/short-id-column";
import type {
	ReplayRow,
	ReplayRowIdentity,
	ReplayRowIndexes,
	Unjudged,
} from "#server/run-history-contract";
import { firedIdsOf } from "#server/run-history-group-fired-blockers";
import { stagesAround } from "#server/run-history-stages-around";
import { wallTime } from "#server/run-record";
import type { CostReading } from "#server/run-record";
import type { ContextLink } from "#server/run-status";

const NO_SPEND_USD = 0;

const REPLAY_FINAL_OUTCOME_REASON =
	"a replay runs one stage, and only a whole run reaches the final judge";

const REPLAY_WALL_TIME_REASON = "the replay record predates its elapsed time";

const SOURCE_MANIFEST_REASON =
	"the source run's manifest, which names its stages, is not recorded";

async function replayRow(
	{ runsDirectory, attempt, shortId }: ReplayRowIdentity,
	{ shortIds, attempts }: ReplayRowIndexes,
): Promise<Unjudged<ReplayRow>> {
	const record = await readReplayRecord(
		replayRecordFile(runsDirectory, attempt.lineage, attempt.timestamp),
	);
	const { manifestFile } = benchmarkRunPaths(runsDirectory, record.runName);
	const manifest = (await Bun.file(manifestFile).exists())
		? await loadRunManifest(manifestFile)
		: undefined;
	const caseId = manifest?.caseId;
	const recordId = formatRecordId({ kind: "attempt:stage", ...attempt });

	return {
		attempt: attempts.get(recordId),
		caseId,
		checkpointShortId: await checkpointShortId(runsDirectory, shortIds, {
			run: record.runName,
			stage: record.consumed.stage,
		}),
		corpusVersion: record.corpusVersion,
		cost: replayCost(record),
		finalOutcome: {
			reason: REPLAY_FINAL_OUTCOME_REASON,
			state: "available",
			status: "NOT_APPLICABLE",
		},
		firedBlockers: firedIdsOf(record.scorecard.grade.hardBlockers),
		grade: record.scorecard.grade.grade,
		kind: "replay",
		lineage: attempt.lineage,
		links: [replayLink(attempt, record.consumed.lineage, caseId)],
		pipelineStages:
			manifest === undefined
				? { reasons: [SOURCE_MANIFEST_REASON], state: "unavailable" }
				: stagesAround(
						[record.stage],
						manifest.pipeline.stages.map(({ name }) => name),
					),
		recordId,
		shortId,
		stage: record.stage,
		status: record.scorecard.grade.verdict,
		timestamp: attempt.timestamp,
		wallTime: wallTime(record.elapsedMs, REPLAY_WALL_TIME_REASON),
	};
}

/** A replay records each spend, so its sum lacks no part. */
function replayCost(
	record: Pick<
		ReplayRecord,
		"stage" | "stageCostUsd" | "productOwnerCostUsd" | "judgeCostUsd"
	>,
): CostReading {
	const parts = [
		{ part: `${record.stage} session`, usd: record.stageCostUsd },
		{ part: "Product Owner", usd: record.productOwnerCostUsd },
		{ part: `${record.stage} judge`, usd: record.judgeCostUsd },
	];

	return {
		missing: [],
		parts,
		state: "available",
		usd: parts.reduce((sum, { usd }) => sum + usd, NO_SPEND_USD),
	};
}

/**
 * The replay page reads the source run's manifest, so a replay whose source
 * manifest is gone has no page that renders.
 */
function replayLink(
	attempt: StageAttemptId,
	consumedLineage: string,
	caseId: string | undefined,
): ContextLink {
	if (consumedLineage !== attempt.lineage) {
		return {
			label: "context",
			reason: "filed under a lineage it did not consume",
			state: "unavailable",
		};
	}

	if (caseId === undefined) {
		return {
			label: "context",
			reason: "source run manifest not recorded",
			state: "unavailable",
		};
	}

	return {
		href: `/replays/${encodeURIComponent(attempt.lineage)}/${encodeURIComponent(attempt.timestamp)}`,
		label: "context",
		state: "available",
	};
}

export {
	REPLAY_FINAL_OUTCOME_REASON,
	REPLAY_WALL_TIME_REASON,
	SOURCE_MANIFEST_REASON,
	replayRow,
};
