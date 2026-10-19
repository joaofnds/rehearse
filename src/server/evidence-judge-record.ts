import { basename } from "node:path";

import { unhandled } from "#benchmark/contracts";
import { benchmarkRunPaths, runStageFiles } from "#benchmark/run-layout";
import { UsageError } from "#cli/commands";
import { parseRunRecordId } from "#cli/record-id";
import { EvidenceSourceError } from "#server/evidence-source-contract";
import type { EvidenceJudge } from "#server/evidence-source-contract";

/**
 * The record file the judge wrote into. A stage is found among the stage
 * records the run wrote by comparing names, never by joining it into a path.
 */
async function judgeRecordFile(
	runsDirectory: string,
	run: string,
	judge: EvidenceJudge,
): Promise<string | undefined> {
	switch (judge.kind) {
		case "final": {
			const file = benchmarkRunPaths(runsDirectory, run).artifactFile;

			return (await Bun.file(file).exists()) ? file : undefined;
		}
		case "stage": {
			const files = await runStageFiles(runsDirectory, run);

			return files.find(
				(file) => basename(file) === `${run}.${judge.stage}.json`,
			);
		}
		default: {
			return unhandled(judge, "evidence judge");
		}
	}
}

function runName(run: string): string {
	try {
		return parseRunRecordId(run).run;
	} catch (error) {
		if (error instanceof UsageError) {
			throw new EvidenceSourceError("refused", error.message);
		}

		throw error;
	}
}

export { judgeRecordFile, runName };
