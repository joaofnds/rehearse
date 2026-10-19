import { z } from "zod";

import { textIfPresent } from "./file-presence";
import type { ReadManifestEntry } from "./read-manifest";
import { readManifestSchema } from "./read-manifest";
import {
	checkpointRecordFile,
	confirmationGroupPaths,
	confirmationRepIds,
} from "./run-layout";
import type { ConfirmationGroupPaths } from "./run-layout";
import { parseSessionAttemptRecord } from "./session-record";

const LEGACY_SESSION_RECORD_SCHEMA_VERSION = 1;

const recordedManifestSchema = z
	.object({ readManifest: readManifestSchema.optional() })
	.loose();

/**
 * Every read one stage of a group's reps recorded, once per file and hash. A
 * rep keeps it on its stage file, and one that saved a checkpoint keeps it
 * there too, as a rep recorded before its stage file held one does.
 */
async function repStageManifest(
	paths: ConfirmationGroupPaths,
	repIds: readonly string[],
	stage: string,
): Promise<readonly ReadManifestEntry[]> {
	const entries = new Map<string, ReadManifestEntry>();
	await Array.fromAsync(repIds, async (repId) => {
		const rep = paths.rep(repId);
		await Array.fromAsync(
			[
				rep.stageFile(stage),
				checkpointRecordFile(rep.checkpointDirectory(stage)),
			],
			async (file) => {
				const text = await textIfPresent(file);
				if (text === undefined) {
					return;
				}

				const { readManifest } = recordedManifestSchema.parse(JSON.parse(text));
				for (const entry of readManifest ?? []) {
					entries.set(readKey(entry), entry);
				}
			},
		);
	});

	return [...entries.values()];
}

/** Every read a session group's rep attempts recorded, once per file and hash. */
async function repAttemptManifest(
	runsDirectory: string,
	groupId: string,
): Promise<readonly ReadManifestEntry[]> {
	const paths = confirmationGroupPaths(runsDirectory, groupId);
	const entries = new Map<string, ReadManifestEntry>();
	await Array.fromAsync(
		await confirmationRepIds(runsDirectory, groupId),
		async (repId) => {
			for (const entry of await repAttemptReads(paths, repId)) {
				entries.set(readKey(entry), entry);
			}
		},
	);

	return [...entries.values()];
}

async function repAttemptReads(
	paths: ConfirmationGroupPaths,
	repId: string,
): Promise<readonly ReadManifestEntry[]> {
	const text = await textIfPresent(paths.rep(repId).attemptFile);
	if (text === undefined) {
		return [];
	}

	const record = parseSessionAttemptRecord(text);

	return record.schemaVersion === LEGACY_SESSION_RECORD_SCHEMA_VERSION
		? []
		: (record.readManifest ?? []);
}

function readKey(entry: ReadManifestEntry): string {
	return `${entry.half}:${entry.path}:${entry.sha256}`;
}

export { repStageManifest, repAttemptManifest, repAttemptReads };
