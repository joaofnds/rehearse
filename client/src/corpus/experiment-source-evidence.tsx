import { corpusVersionLabel } from "#benchmark/corpus-version-label";
import type { RunRecordResponse } from "#client/monitor/run-record-query";
import {
	consumedCheckpoint,
	stageReplayRefusal,
} from "#client/monitor/run-record-query";

const PREVIOUS_ELEMENT_OFFSET = 1;

/** The saved step whose instruction prompted this edit. */
interface CorpusExperimentSource {
	readonly run: string;
	readonly stage: string;
}

type SourceEvidence = {
	readonly corpus: string;
	readonly checkpoint: string;
} & (
	| { readonly replayable: true; readonly reason?: never }
	| { readonly replayable: false; readonly reason: string }
);

function sourceCorpus(stage: RunRecordResponse["stages"][number]): string {
	if (stage.corpusVersion?.kind === "version") {
		return corpusVersionLabel(stage.corpusVersion.digest);
	}
	if (stage.corpusVersion?.kind === "refused") {
		return `measurement refused: ${stage.corpusVersion.refusal}`;
	}
	return "not recorded";
}

/** Reads provenance from the record, including the checkpoint the step consumed. */
function sourceEvidence(
	record: RunRecordResponse,
	source: CorpusExperimentSource,
	path: string,
): SourceEvidence {
	const index = record.stages.findIndex(({ stage }) => stage === source.stage);
	const stage = record.stages[index];
	if (stage === undefined) {
		return {
			checkpoint: "not recorded",
			corpus: "not recorded",
			reason: "This step is not in the saved run record.",
			replayable: false,
		};
	}

	const corpus = sourceCorpus(stage);
	const checkpoint = sourceCheckpoint(record, index);
	const refusal = stageReplayRefusal(record, source.stage);
	if (refusal !== undefined) {
		return {
			checkpoint,
			corpus,
			reason: refusal,
			replayable: false,
		};
	}
	return sourceFileEvidence(stage, path, { checkpoint, corpus });
}

function sourceCheckpoint(record: RunRecordResponse, index: number): string {
	const stage = record.stages[index];
	const predecessor = record.stages[index - PREVIOUS_ELEMENT_OFFSET];
	const upstream = stage === undefined ? undefined : consumedCheckpoint(stage);
	const checkpointId =
		upstream?.checkpointShortId.state === "available"
			? upstream.checkpointShortId.shortId
			: undefined;
	const checkpoint =
		predecessor === undefined
			? `initial checkpoint${checkpointId === undefined ? "" : ` · ${checkpointId}`}`
			: `${predecessor.stage} checkpoint${checkpointId === undefined ? "" : ` · ${checkpointId}`}`;
	return checkpoint;
}

function sourceFileEvidence(
	stage: RunRecordResponse["stages"][number],
	path: string,
	{ checkpoint, corpus }: Pick<SourceEvidence, "checkpoint" | "corpus">,
): SourceEvidence {
	const readFile =
		stage.readManifest.state === "available" &&
		stage.readManifest.entries.some(
			(entry) => entry.half === "corpus" && entry.path === path,
		);
	if (!readFile) {
		return {
			checkpoint,
			corpus,
			reason: `${path} is not recorded as read from the corpus by this step.`,
			replayable: false,
		};
	}
	return { checkpoint, corpus, replayable: true };
}

export { sourceEvidence as default };
export type { CorpusExperimentSource, SourceEvidence };
