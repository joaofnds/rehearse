import type { RecordedStageEvidence } from "#benchmark/contracts";
import type { StageEvidenceRecord } from "#server/evidence-judged-items";

const passwdEvidence: RecordedStageEvidence = {
	claim: "the rules say so",
	locator: {
		endLine: 1,
		file: "../../etc/passwd",
		kind: "lines",
		occurrences: 1,
		startLine: 1,
	},
	path: "../../etc/passwd",
	quote: "recorded bytes",
	source: "baseline-context",
};

const judgedItem = { evidence: [passwdEvidence], id: "scope", status: "PASS" };
const baselineContext = [
	{ content: "recorded bytes\n", path: "../../etc/passwd" },
];

/** The accepted evidence record, with the original intentionally untrusted citation. */
class StageEvidenceRecordBuilder {
	public constructor(
		private readonly props: Partial<StageEvidenceRecord> = {},
	) {}

	public citing(evidence: RecordedStageEvidence): StageEvidenceRecordBuilder {
		const { grade } = this.build();

		return new StageEvidenceRecordBuilder({
			...this.props,
			grade: {
				...grade,
				requirements: [{ ...judgedItem, evidence: [evidence] }],
			},
		});
	}

	public build(): StageEvidenceRecord {
		return {
			grade: { dimensions: [], hardBlockers: [], requirements: [judgedItem] },
			input: {
				baselineContext,
				instructions: "Instructions",
				kind: "delivery",
				priorArtifacts: [],
				productBrief: "Brief",
				stage: "build",
				task: "Task",
				taskState: "State",
				transcript: {
					costUsd: 1,
					exchanges: [],
					providerCalls: [],
					sessionId: "session",
					stage: "build",
				},
			},
			stage: "build",
			...this.props,
		};
	}
}

export { StageEvidenceRecordBuilder as default, judgedItem, baselineContext };
