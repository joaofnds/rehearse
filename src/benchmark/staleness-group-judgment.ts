import { readChangedFilesOnly } from "./checkpoint";
import type { ParsedConfirmationGroupRecord } from "./confirmation-record";
import type { Immutable } from "./contracts";
import type { CorpusUnderTest } from "./corpus-version";
import type {
	CurrentSessionKnobs,
	JudgedReads,
	RecordStaleness,
} from "./staleness-contract";
import namedKnobCauses from "./staleness-knobs";
import { rubricCauses } from "./staleness-rubrics";

const NO_STALENESS_CAUSES = 0;

const EMPTY_COLLECTION_LENGTH = 0;

interface GroupStalenessJudgment {
	readonly id: string;
	readonly record: Immutable<ParsedConfirmationGroupRecord>;
	readonly corpus: JudgedReads;
	readonly underTest: CorpusUnderTest;
	readonly knobs: CurrentSessionKnobs;
}

function judgeConfirmationGroup({
	id,
	record,
	corpus,
	underTest,
	knobs,
}: GroupStalenessJudgment): RecordStaleness {
	const knobCauses = namedKnobCauses(record.inputs, knobs);
	const rubric = rubricCauses(corpus.readManifest);
	const causes = [...knobCauses, ...corpus.causes, ...rubric];
	return {
		causes,
		changedFiles: corpus.changedFiles,
		distance: underTest.distanceOf(record.inputs.corpusVersion),
		id,
		onlyCorpusFiles:
			knobCauses.length === EMPTY_COLLECTION_LENGTH &&
			rubric.length === EMPTY_COLLECTION_LENGTH &&
			readChangedFilesOnly(corpus),
		readFiles: corpus.readFiles,
		readManifest: corpus.readManifest,
		stale: causes.length > NO_STALENESS_CAUSES,
	};
}

export { judgeConfirmationGroup as default };
