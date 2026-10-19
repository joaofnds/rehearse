import { dirname, relative } from "node:path";

import type { DigestedRecord } from "./comparison-evidence";
import type { LoadArmRequest } from "./comparison-evidence-files";
import {
	descendantPath,
	evidenceError,
	readEvidenceFile,
} from "./comparison-evidence-files";
import type { StageGradingRecord } from "./comparison-stage-grading";
import { stageGradingRecordSchema } from "./comparison-stage-grading";
import type { ParsedConfirmationRepRecord } from "./confirmation-record";
import type { Immutable } from "./contracts";

interface StageScorecardLocation {
	readonly repPath: string;
	readonly field: string;
}

function parsedScorecard(text: string): StageGradingRecord | undefined {
	try {
		return stageGradingRecordSchema.parse(JSON.parse(text));
	} catch {
		return undefined;
	}
}

/**
 * A judged stage's scorecard holds the blockers and dimensions What moved
 * reads, so a stage comparison hashes it as source evidence like the rep.
 */
async function loadStageScorecards(
	request: Readonly<LoadArmRequest>,
	record: Immutable<ParsedConfirmationRepRecord>,
	{ repPath, field }: StageScorecardLocation,
): Promise<readonly DigestedRecord<StageGradingRecord>[]> {
	const scorecards: DigestedRecord<StageGradingRecord>[] = [];
	await Array.fromAsync(
		[...record.stages].entries(),
		async ([index, stage]) => {
			if (stage.status !== "JUDGED") {
				return;
			}

			const stageField = `${field}.stages[${index}].evidence.recordFile`;
			const scorecardPath = descendantPath(request, {
				field: stageField,
				path: stage.evidence.recordFile,
				root: dirname(repPath),
			});
			const scorecardSource = await readEvidenceFile({
				arm: request.role,
				caseId: request.caseId,
				field: stageField,
				path: scorecardPath,
			});
			const parsed = parsedScorecard(scorecardSource.text);
			if (parsed?.stage !== stage.stage) {
				throw evidenceError(
					{ arm: request.role, caseId: request.caseId, field: stageField },
					`invalid stage scorecard for ${stage.stage}`,
				);
			}
			scorecards.push({
				canonicalPath: scorecardSource.canonicalPath,
				path: relative(request.manifestDirectory, scorecardPath),
				record: parsed,
				sha256: scorecardSource.sha256,
			});
		},
	);

	return scorecards;
}

export { loadStageScorecards as default };
