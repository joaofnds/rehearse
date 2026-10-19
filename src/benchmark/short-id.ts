import { join } from "node:path";

import { isCaseId } from "./case";
import { INITIAL_CHECKPOINT_STAGE } from "./checkpoint";
import { readdirIfPresent } from "./file-presence";
import { REGISTRY_DIRECTORY } from "./short-id-contract";
import type {
	ShortIdEntry,
	ShortIdRegistries,
	UnreadableRegistry,
} from "./short-id-contract";
import { readShortIds } from "./short-id-registry";

const INITIAL_CHECKPOINT_NUMBER = 0;

const CHECKPOINT_STAGE_NUMBER_BASE = 1;

const MISSING_SEQUENCE_INDEX = -1;

const ORDINAL_BASE = 1;

/**
 * The checkpoint a group replayed, which only its short-id claim records,
 * since the group record carries a lineage two runs can share.
 */
function claimedReplaySource(
	entries: readonly ShortIdEntry[],
	groupId: string,
): { readonly run: string; readonly stage: string } | undefined {
	const claim = entries.find(
		({ record }) => record.kind === "group" && record.groupId === groupId,
	);

	return claim?.record.kind === "group" ? claim.record.source : undefined;
}

/**
 * Every short id claimed in any case, for a listing that prints them beside
 * Record IDs. It reads registries and builds none, so listing stays read-only
 * and a case no command has claimed in prints no short ids. A case whose
 * registry cannot be read is reported rather than thrown, so it hides only
 * its own short ids.
 */
async function readAllShortIds(
	runsDirectory: string,
): Promise<ShortIdRegistries> {
	const readRegistryCases = async (): Promise<
		readonly string[] | ShortIdRegistries
	> => {
		try {
			return (
				(await readdirIfPresent(join(runsDirectory, REGISTRY_DIRECTORY))) ?? []
			);
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			return {
				entries: [],
				unreadable: [{ reason, registry: REGISTRY_DIRECTORY }],
			};
		}
	};

	const cases = await readRegistryCases();
	if ("unreadable" in cases) {
		return cases;
	}

	const entries: ShortIdEntry[] = [];
	const unreadable: UnreadableRegistry[] = [];
	await Array.fromAsync(
		cases.filter((name) => isCaseId(name)).toSorted(),
		async (caseId) => {
			try {
				entries.push(...(await readShortIds(runsDirectory, caseId)));
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				unreadable.push({
					reason,
					registry: `${REGISTRY_DIRECTORY}/${caseId}`,
				});
			}
		},
	);

	return { entries, unreadable };
}

/**
 * A checkpoint's label is its place in the run: 0 for the one taken after
 * task setup, then each stage by its position in the pipeline the run froze
 * into its manifest, so the label is fixed when the run starts.
 */
function checkpointStageNumber(
	stages: readonly string[],
	stage: string,
): number | undefined {
	if (stage === INITIAL_CHECKPOINT_STAGE) {
		return INITIAL_CHECKPOINT_NUMBER;
	}

	const index = stages.indexOf(stage);

	return index === MISSING_SEQUENCE_INDEX ? undefined : index + ORDINAL_BASE;
}

function formatCheckpointShortId(runShortId: string, stage: number): string {
	return `${runShortId}/s${String(stage)}`;
}

function checkpointStageAt(
	stages: readonly string[],
	number: number,
): string | undefined {
	return number === INITIAL_CHECKPOINT_NUMBER
		? INITIAL_CHECKPOINT_STAGE
		: stages[number - CHECKPOINT_STAGE_NUMBER_BASE];
}

export {
	claimedReplaySource,
	checkpointStageNumber,
	formatCheckpointShortId,
	checkpointStageAt,
	readAllShortIds,
};
export { formatShortId } from "./short-id-contract";
export { claimShortId, bindReplay } from "./short-id-claim";
export { readShortIds, resolveShortId } from "./short-id-registry";
export type {
	NamedRecord,
	ClaimSubject,
	ShortId,
	ShortIdEntry,
	UnreadableRegistry,
	ShortIdRegistries,
} from "./short-id-contract";
