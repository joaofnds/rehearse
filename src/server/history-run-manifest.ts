import { parseRunManifest } from "#benchmark/manifest";
import type { RunManifest } from "#benchmark/manifest";
import { SessionHistoryReaderError } from "#server/history-read-identity";
import { readVerifiedFile } from "#server/history-verified-file";
import { verifiedFile } from "#server/history-verified-path";

/**
 * The manifest holding a run's case sits inside its checkpoints directory, and
 * it is the only place either a stage or a replay can learn which case it ran.
 */
async function runManifest(
	root: string,
	checkpointsDirectory: string,
): Promise<RunManifest> {
	const manifestFile = await verifiedFile(root, {
		directory: checkpointsDirectory,
		name: "manifest.json",
		required: true,
	});
	if (manifestFile === undefined) {
		throw new SessionHistoryReaderError(
			"not-found",
			"Saved run manifest is unavailable",
		);
	}

	return parseRunManifest(await readVerifiedFile(root, manifestFile));
}

export { runManifest as default };
