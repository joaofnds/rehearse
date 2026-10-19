import type {
	CaseRecordId,
	ComparisonRecordId,
	GroupRecordId,
	RecordBody,
	RunRecordId,
} from "./record-id-contract";
import { caseSegment, segment } from "./record-id-segments";

function parseCaseId({ body, given }: RecordBody): CaseRecordId {
	return {
		caseId: caseSegment({ body, form: "case:<id>", given }),
		kind: "case",
	};
}
function parseRunId({ body, given }: RecordBody): RunRecordId {
	return { kind: "run", run: segment({ body, form: "run:<name>", given }) };
}
function parseGroupId({ body, given }: RecordBody): GroupRecordId {
	return {
		groupId: segment({ body, form: "group:<group-id>", given }),
		kind: "group",
	};
}
function parseComparisonId({ body, given }: RecordBody): ComparisonRecordId {
	return {
		kind: "comparison",
		manifestDigest: segment({
			body,
			form: "comparison:<manifest-digest>",
			given,
		}),
	};
}
export { parseCaseId, parseComparisonId, parseGroupId, parseRunId };
