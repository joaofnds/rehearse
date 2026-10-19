import { loadRunManifest } from "#benchmark/manifest";
import { parseRunSummaryRecord } from "#benchmark/record-summary";
import { benchmarkRunPaths, recordedRunNames } from "#benchmark/run-layout";
import { stoppedStage } from "#benchmark/run-outcome";
import { stoppedStatus } from "#benchmark/stopped-status";

import type { RecordListing } from "./record-listing";
import { collect, numbered } from "./record-listing";

/**
 * A run that stopped at a stage never writes an artifact, and stopping is a
 * normal outcome the pipeline takes whenever a judge grades below the
 * minimum, not a failure to report as unreadable: the stage it stopped at,
 * read from the stop record that stage's file holds, replaces the artifact's
 * status. A run that also has no stop record and no artifact died before any
 * stage finished; it gets a plain line saying so rather than a raw ENOENT. A
 * stopped run whose manifest was never written is reported unreadable rather
 * than replayable.
 */
async function listRuns(runsDirectory: string): Promise<RecordListing> {
	const names = await recordedRunNames(runsDirectory);

	return await numbered(
		runsDirectory,
		await collect(
			names,
			(run) => ({ kind: "run", run }),
			async (run) => {
				const paths = benchmarkRunPaths(runsDirectory, run);
				if (await Bun.file(paths.artifactFile).exists()) {
					const record = parseRunSummaryRecord(
						await Bun.file(paths.artifactFile).text(),
					);
					const replayable = await Bun.file(paths.manifestFile).exists();

					return [
						record.caseId,
						record.status,
						replayable ? "replayable" : "not replayable",
					];
				}

				const stopped = await stoppedStage(runsDirectory, run);
				if (stopped === undefined) {
					return ["no record"];
				}

				const { caseId } = await loadRunManifest(paths.manifestFile).catch(
					(): never => {
						throw new Error(
							`incomplete: no manifest.json at ${paths.manifestFile}`,
						);
					},
				);

				return [caseId, stoppedStatus(stopped.stage), "replayable"];
			},
		),
	);
}

export { listRuns as default };
