import { basename } from "node:path";

import { stageTokenParts } from "#server/run-call-metrics";
import type {
	FinalOutcome,
	PlacedStage,
	Reading,
	RunRecord,
} from "#server/run-record-contract";
import { currentStageIndex, stagePlace } from "#server/run-record-reading";
import { MINIMUM_GRADE_REASON } from "#server/run-record-reasons";
import type { RunRecordSource } from "#server/run-record-source";
import { runTokenParts, runTotals } from "#server/run-record-totals";
import assembleRunStages from "#server/run-stages-assembly";

interface RunRecordEnding {
	readonly outcome: FinalOutcome;
	readonly status: Reading<{ readonly status: string }>;
}

function assembleRunRecord(
	source: RunRecordSource,
	{ outcome, status }: RunRecordEnding,
): RunRecord {
	const { run, manifest, stages, runWide, shortId } = source;
	const names = stages.map(({ stage }) => stage);
	const currentIndex = currentStageIndex(names, outcome);
	const placed = stages.map(
		({ stage, file, checkpoint }, index): PlacedStage => ({
			checkpoint,
			file,
			place: stagePlace(index, currentIndex),
			stage,
		}),
	);

	const { records, cost } = assembleRunStages(source, placed);

	return {
		caseId: manifest.caseId,
		finalOutcome: outcome,
		identity: {
			commit: manifest.sourceSha,
			corpusVersion: manifest.corpusVersion,
			effort: manifest.effort,
			model: manifest.model,
			target: basename(manifest.targetRoot ?? manifest.sourceRoot),
		},
		minimumGrade:
			manifest.minimumGrade === undefined
				? { reasons: [MINIMUM_GRADE_REASON], state: "unavailable" }
				: { letter: manifest.minimumGrade, state: "available" },
		run,
		shortId,
		stages: records,
		status,
		totals: runTotals(
			cost,
			[
				...placed.flatMap((stage) => stageTokenParts(stage)),
				...runTokenParts(runWide),
			],
			runWide,
		),
	};
}

export { assembleRunRecord as default };
