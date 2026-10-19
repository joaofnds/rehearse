import { replayRecordSchema } from "#benchmark/replay";
import { checkpointsEntryForRun } from "#benchmark/run-layout";
import type { ResolvedHistoryInput } from "#server/history-input-contract";
import {
	SessionHistoryReaderError,
	parseIdentity,
} from "#server/history-read-identity";
import type { ReplayHistoryIdentityInput } from "#server/history-read-identity";
import runManifest from "#server/history-run-manifest";
import { readVerifiedFile } from "#server/history-verified-file";
import {
	canonicalRunsRoot,
	verifiedDirectory,
	verifiedFile,
} from "#server/history-verified-path";

/**
 * A replay is filed under the lineage it consumed rather than under a run, so
 * the directory name is the caller's and the consumed lineage is what confirms
 * it. The record's own lineage is the one the replay produced and names no
 * directory. It keeps no raw transcript: the worktree whose name locates the
 * provider's copy is removed when the replay finishes. Its parsed exchanges
 * stay out of the report, which is what the unavailable state is for.
 */
async function replayInput(
	identity: Readonly<ReplayHistoryIdentityInput>,
): Promise<ResolvedHistoryInput> {
	const root = await canonicalRunsRoot(identity.runsDirectory);
	const directory = await verifiedDirectory(root, [
		"replays",
		identity.lineage,
	]);
	const recordFile = await verifiedFile(root, {
		directory,
		name: `${identity.timestamp}.json`,
		required: true,
	});
	if (recordFile === undefined) {
		throw new SessionHistoryReaderError(
			"not-found",
			"Saved replay record is unavailable",
		);
	}

	const record = replayRecordSchema.parse(
		JSON.parse(await readVerifiedFile(root, recordFile)),
	);
	if (record.consumed.lineage !== identity.lineage) {
		throw new SessionHistoryReaderError(
			"refused",
			"Saved replay does not own this lineage identity",
		);
	}

	const checkpointsDirectory = await verifiedDirectory(root, [
		checkpointsEntryForRun(parseIdentity(record.runName)),
	]);
	return replayHistoryInput(
		root,
		record,
		await runManifest(root, checkpointsDirectory),
	);
}

interface ReplayHistoryRecord {
	readonly runName: string;
	readonly stage: string;
	readonly lineage: string;
	readonly consumed: { readonly lineage: string };
	readonly model: ReturnType<typeof replayRecordSchema.parse>["model"];
	readonly effort?: ReturnType<typeof replayRecordSchema.parse>["effort"];
	readonly corpusFiles: readonly {
		readonly path: string;
		readonly sha256: string;
	}[];
}

function replayHistoryInput(
	root: string,
	record: ReplayHistoryRecord,
	manifest: Awaited<ReturnType<typeof runManifest>>,
): ResolvedHistoryInput {
	return {
		metadata: {
			attempt: {
				caseId: manifest.caseId,
				corpusFiles: record.corpusFiles.map(({ path, sha256 }) => ({
					path,
					sha256,
				})),
				effort: record.effort,
				kind: "stage",
				lineage: record.lineage,
				model: record.model,
				run: record.runName,
				stage: record.stage,
				upstream: record.consumed.lineage,
			},
			prefixLinesExcluded: 0,
			resolvedCorpusFiles: [],
			unavailableReason: "replay-retains-none",
		},
		reportedCostUsd: undefined,
		root,
		transcriptFile: undefined,
	};
}

export { replayInput as default };
