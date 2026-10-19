import {
	baselineContext,
	judgedItem,
} from "#server/api-evidence-record-builder";
import type { FinalEvidenceRecord } from "#server/evidence-judged-items";

class FinalEvidenceRecordBuilder {
	public constructor(
		private readonly props: Partial<FinalEvidenceRecord> = {},
	) {}

	public build(): FinalEvidenceRecord {
		return {
			baselineContext,
			checkIntegrity: { evidence: [], status: "PASS" },
			diff: "",
			grade: { requirements: [judgedItem], summary: "s", verdict: "PASS" },
			localChecks: { evidence: [], status: "PASS" },
			...this.props,
		};
	}
}

export { FinalEvidenceRecordBuilder as default };
