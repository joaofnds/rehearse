import { displayPath } from "#benchmark/config";
import type { Immutable, RecordedStageEvidence } from "#benchmark/contracts";
import { judgeRecordFile, runName } from "#server/evidence-judge-record";
import { finalItems, stageItems } from "#server/evidence-judged-items";
import { notFound } from "#server/evidence-source-contract";
import type {
	EvidenceRequest,
	EvidenceSource,
	JudgedItems,
} from "#server/evidence-source-contract";
import sourceView from "#server/evidence-source-source-view";
import { redactedFilePath } from "#server/redact-path";

const INVALID_BLOCK_INDEX = -1;

async function readEvidenceSource(
	request: EvidenceRequest,
): Promise<EvidenceSource> {
	const run = runName(request.run);
	const file = await judgeRecordFile(request.runsDirectory, run, request.judge);
	if (file === undefined) {
		throw notFound(`Run ${run} recorded no such judge`);
	}

	const text = await Bun.file(file).text();
	const judged =
		request.judge.kind === "final" ? finalItems(text) : stageItems(text);
	const evidence = selectedEvidence(request, judged);
	if (judged === undefined || evidence === undefined) {
		throw notFound(
			`Run ${run} recorded no evidence ${request.index} for ${request.section} ${request.item}`,
		);
	}

	return {
		claim: evidence.claim,
		path: evidence.path,
		record: redactedFilePath(displayPath(file)),
		source: evidence.source,
		...(evidence.quote !== undefined && { quote: evidence.quote }),
		view: sourceView(evidence, judged.sources),
	};
}

function selectedEvidence(
	request: EvidenceRequest,
	judged: Immutable<JudgedItems> | undefined,
): Immutable<RecordedStageEvidence> | undefined {
	const item = Object.hasOwn(judged?.sections ?? {}, request.section)
		? judged?.sections[request.section]?.find(({ id }) => id === request.item)
		: undefined;
	const index = /^\d+$/u.test(request.index)
		? Number(request.index)
		: INVALID_BLOCK_INDEX;

	return item?.evidence[index];
}

export { readEvidenceSource };
export { EvidenceSourceError } from "#server/evidence-source-contract";
export type {
	EvidenceJudge,
	EvidenceRequest,
	SourceView,
	EvidenceSource,
} from "#server/evidence-source-contract";
