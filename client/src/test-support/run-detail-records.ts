import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";
import RunRecordStageBuilder from "#client/test-support/run-record-stage-test-builder";
import RunRecordBuilder from "#client/test-support/run-record-test-builder";
import type { RunRecord, RunRecordStage } from "#server/run-record";

const STALENESS_VERSION_DISTANCE_CHANGED = 1;

const STALENESS_VERSION_DISTANCE_CURRENT = 0;

type HistoryRow = RunHistoryResponse["rows"][number];

type PipelineRow = Extract<HistoryRow, { readonly kind: "run" }>;

const RUN = "2026-09-28T10-03-07.498Z";

const CORPUS = "a41c7e".padEnd(SHA256_HEX_CHARACTERS, "0");

function initialCheckpointStage(
	firstStepCheckpoint: "recorded" | "missing",
): RunRecordStage {
	return new RunRecordStageBuilder({
		artifactsIn: {
			entries: [
				{
					checkpointShortId: {
						reasons: ["predates short ids"],
						state: "unavailable",
					},
					from: "upstream checkpoint",
					target: "acme-api",
					upstream: "initial",
				},
			],
			missing: [],
		},

		checkpoint: firstStepCheckpoint,

		grade: {
			letter: "A",
			reachesMinimum: true,
			state: "available",
			verdict: "CONTINUE",
		},

		stage: "shape",

		status: "graded",
	}).build();
}

/** A three-stage run with its initial input retained, stopped at build below minimum B. */
function stoppedAtBuild(
	firstStepCheckpoint: "recorded" | "missing" = "recorded",
): RunRecord {
	return {
		...new RunRecordBuilder({
			run: RUN,
			stages: [
				initialCheckpointStage(firstStepCheckpoint),
				new RunRecordStageBuilder({
					grade: {
						letter: "D",
						reachesMinimum: false,
						state: "available",
						verdict: "CONTINUE",
					},

					stage: "build",

					status: "stopped",
				}).build(),
				new RunRecordStageBuilder({ stage: "verify" }).build(),
			],
		}).build(),
		finalOutcome: {
			reason: "the run stopped before the final judge",
			stage: "verify",
			status: "NOT_REACHED",
		},
		minimumGrade: { letter: "B", state: "available" },
		shortId: { shortId: "r-0147", state: "available" },
		status: { state: "available", status: "STOPPED:build" },
	};
}

function stoppedRow(): PipelineRow {
	return {
		...new PipelineRunRowBuilder({
			corpusVersion: { digest: CORPUS, kind: "version" },
			run: RUN,
			status: "STOPPED:build",
		})
			.withExecutionProgress()
			.build(),
		shortId: "r-0147",
	};
}

/** How the server judged a record against the corpus under test. */
function judgedStaleness(stale: boolean): HistoryRow["staleness"] {
	return {
		causes: stale ? ["skills/implement.md changed"] : [],
		changedFiles: [],
		distance: {
			kind: "measured",
			versions: stale
				? STALENESS_VERSION_DISTANCE_CHANGED
				: STALENESS_VERSION_DISTANCE_CURRENT,
		},
		onlyCorpusFiles: stale,
		stale,
		state: "available",
	};
}

export { CORPUS, judgedStaleness, RUN, stoppedAtBuild, stoppedRow };
export type { HistoryRow };
