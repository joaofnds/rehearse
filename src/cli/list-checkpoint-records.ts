import { readdir } from "node:fs/promises";

import { parseCheckpointRecord } from "#benchmark/checkpoint";
import {
	benchmarkRunPaths,
	checkpointRecordFile,
	recordedRunNames,
} from "#benchmark/run-layout";
import type { UnreadableRecord } from "#cli/output";
import { controlRelative } from "#cli/output";
import { formatRecordId } from "#cli/record-id";
import { checkpointShortId, shortIdsByRecordId } from "#cli/short-id-column";

import type { RecordListing } from "./record-listing";
import { collect, withShortIds } from "./record-listing";

const LEXICAL_BEFORE = -1;
const LEXICAL_AFTER = 1;

interface RunCheckpoint {
	readonly run: string;
	readonly stage: string;
}

interface CheckpointEnumeration {
	readonly checkpoints: readonly RunCheckpoint[];
	readonly unreadable: readonly UnreadableRecord[];
}
async function recordedCheckpoints(
	runsDirectory: string,
): Promise<CheckpointEnumeration> {
	const checkpoints: RunCheckpoint[] = [];
	const unreadable: UnreadableRecord[] = [];

	await Array.fromAsync(await recordedRunNames(runsDirectory), async (run) => {
		const paths = benchmarkRunPaths(runsDirectory, run);

		try {
			const stages = await stageDirectories(paths.checkpointsDirectory);
			checkpoints.push(...stages.map((stage) => ({ run, stage })));
		} catch (error) {
			unreadable.push({
				id: formatRecordId({ kind: "run", run }),
				reason: controlRelative(
					error instanceof Error ? error.message : String(error),
				),
			});
		}
	});

	return { checkpoints, unreadable };
}

async function stageDirectories(
	checkpointsDirectory: string,
): Promise<readonly string[]> {
	try {
		const entries = await readdir(checkpointsDirectory, {
			withFileTypes: true,
		});

		return entries
			.filter((entry) => entry.isDirectory())
			.map(({ name }) => name)
			.toSorted((left, right) =>
				left < right ? LEXICAL_BEFORE : LEXICAL_AFTER,
			);
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return [];
		}

		throw error;
	}
}

async function listCheckpoints(runsDirectory: string): Promise<RecordListing> {
	const { checkpoints, unreadable: enumerationFailures } =
		await recordedCheckpoints(runsDirectory);
	const { shortIds, unreadable } = await shortIdsByRecordId(runsDirectory);
	const labelled = new Map<string, string>();

	await Array.fromAsync(checkpoints, async ({ run, stage }) => {
		const label = await checkpointShortId(runsDirectory, shortIds, {
			run,
			stage,
		});
		if (label !== undefined) {
			labelled.set(formatRecordId({ kind: "checkpoint", run, stage }), label);
		}
	});

	const listing = await collect(
		checkpoints,
		({ run, stage }) => ({ kind: "checkpoint", run, stage }),
		async ({ run, stage }) => {
			const paths = benchmarkRunPaths(runsDirectory, run);
			const recordFile = checkpointRecordFile(paths.checkpointDirectory(stage));
			if (!(await Bun.file(recordFile).exists())) {
				throw new Error("incomplete: no checkpoint.json recorded");
			}

			const record = parseCheckpointRecord(await Bun.file(recordFile).text());

			return [record.stage, record.lineage];
		},
	);

	return withShortIds(
		{ ...listing, unreadable: [...enumerationFailures, ...listing.unreadable] },
		{ shortIds: labelled, unreadable },
	);
}

export { listCheckpoints, recordedCheckpoints };
export type { RunCheckpoint };
