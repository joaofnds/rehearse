import type { ParsedConfirmationGroupRecord } from "#benchmark/confirmation-record";
import type { GradedHardBlockers, Immutable } from "#benchmark/contracts";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import type {
	FiredBlockers,
	RepStageReading,
} from "#server/run-history-contract";
import {
	firedBlockerIds,
	readStageFile,
	recordedHardBlockers,
} from "#server/run-record";

const EMPTY_COLLECTION_LENGTH = 0;

const NO_GRADED_BLOCKERS_REASON = "no stage record holds graded hard blockers";

const SESSION_BLOCKERS_REASON =
	"a session rep is graded by its checks, which name no hard blockers";

/**
 * The blockers each rep's stage judges fired, from the stage records rather
 * than the judge attempts, since a retried attempt's payload can disagree
 * with the grade the rep kept. A stage the rep never reached wrote no record
 * and adds nothing. An unreadable record could hide a fired blocker, so the
 * group names none rather than an incomplete set.
 */
async function groupFiredBlockers(
	runsDirectory: string,
	record: Immutable<ParsedConfirmationGroupRecord>,
): Promise<FiredBlockers> {
	if (record.mode === "session") {
		return { reasons: [SESSION_BLOCKERS_REASON], state: "unavailable" };
	}

	const paths = confirmationGroupPaths(runsDirectory, record.groupId);
	const stages = record.repRecords.flatMap(({ repId }) =>
		record.declaredStages.map((stage) => ({ repId, stage })),
	);
	const readings = await Promise.all(
		stages.map(async ({ repId, stage }): Promise<RepStageReading> => {
			try {
				const file = await readStageFile(paths.rep(repId), stage);

				return { fired: firedIdsOf(recordedHardBlockers(file)), state: "read" };
			} catch {
				return {
					reason: `the ${stage} stage record of ${repId} is unreadable`,
					state: "unreadable",
				};
			}
		}),
	);

	const unreadable = readings.flatMap((reading) =>
		reading.state === "unreadable" ? [reading.reason] : [],
	);
	if (unreadable.length > EMPTY_COLLECTION_LENGTH) {
		return { reasons: unreadable, state: "unavailable" };
	}

	return firedBlockersOf(
		readings.flatMap((reading) =>
			reading.state === "read" ? [reading.fired] : [],
		),
	);
}

/** The ids one stage grade found fired, where the grade recorded its blockers. */
function firedIdsOf(
	hardBlockers: GradedHardBlockers | undefined,
): FiredBlockers {
	if (hardBlockers === undefined) {
		return { reasons: [NO_GRADED_BLOCKERS_REASON], state: "unavailable" };
	}

	return { ids: firedBlockerIds(hardBlockers), state: "available" };
}

/**
 * Every id the graded stages found fired, once each. A stage its judge never
 * graded fired none the record can name, so it adds nothing.
 */
function firedBlockersOf(stages: readonly FiredBlockers[]): FiredBlockers {
	const graded = stages.flatMap((blockers) =>
		blockers.state === "available" ? [blockers.ids] : [],
	);
	if (graded.length === EMPTY_COLLECTION_LENGTH) {
		return { reasons: [NO_GRADED_BLOCKERS_REASON], state: "unavailable" };
	}

	return { ids: [...new Set(graded.flat())], state: "available" };
}

export {
	SESSION_BLOCKERS_REASON,
	groupFiredBlockers,
	firedIdsOf,
	firedBlockersOf,
	NO_GRADED_BLOCKERS_REASON,
};
