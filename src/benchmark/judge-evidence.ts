import type {
	ContextFile,
	LocalCheckResult,
	StageJudgeInput,
} from "./contracts";
import type { JsonFieldOrder } from "./ordered-json";
import orderedJson from "./ordered-json";

// These orders are the evidence protocol sent to judges before native object
// sorting. Keep them here so source style cannot change an experiment's prompt.
const CONTEXT_FILE_ORDER: JsonFieldOrder = { fields: ["path", "content"] };
const CHECK_RESULT_ORDER: JsonFieldOrder = {
	children: { evidence: { fields: ["source", "path", "claim"] } },
	fields: ["status", "evidence"],
};
const METRICS_ORDER: JsonFieldOrder = {
	children: {
		modelUsage: {
			fields: [],
			// Model names belong to the provider; retain their insertion order.
			values: {
				fields: [
					"inputTokens",
					"outputTokens",
					"cacheReadInputTokens",
					"cacheCreationInputTokens",
					"costUSD",
					"contextWindow",
					"maxOutputTokens",
				],
			},
		},
	},
	fields: [
		"costUsd",
		"inputTokens",
		"outputTokens",
		"cacheReadTokens",
		"cacheWriteTokens",
		"turns",
		"durationMs",
		"apiDurationMs",
		"modelUsage",
	],
};
const TRANSCRIPT_ORDER: JsonFieldOrder = {
	children: {
		exchanges: {
			children: { agent: { fields: ["status", "message"] } },
			fields: ["agent", "productOwnerAnswer"],
		},
		providerCalls: {
			children: { metrics: METRICS_ORDER },
			fields: ["metrics"],
		},
	},
	fields: ["stage", "sessionId", "costUsd", "providerCalls", "exchanges"],
};
const STAGE_EVIDENCE_ORDER: JsonFieldOrder = {
	children: {
		artifact: CONTEXT_FILE_ORDER,
		baselineContext: CONTEXT_FILE_ORDER,
		checkIntegrity: CHECK_RESULT_ORDER,
		localChecks: CHECK_RESULT_ORDER,
		priorArtifacts: CONTEXT_FILE_ORDER,
		transcript: TRANSCRIPT_ORDER,
	},
	// A planning artifact is appended after the shared session input. Delivery
	// appends commit subjects before its two harness results.
	fields: [
		"stage",
		"kind",
		"task",
		"productBrief",
		"instructions",
		"baselineContext",
		"taskState",
		"transcript",
		"priorArtifacts",
		"diff",
		"changedPaths",
		"artifact",
		"commitSubjects",
		"checkIntegrity",
		"localChecks",
		"harnessFailure",
	],
};
const FINAL_EVIDENCE_FIELDS = [
	"baselineContext",
	"checkIntegrity",
	"localChecks",
	"diff",
] as const;
const FINAL_EVIDENCE_ORDER: JsonFieldOrder = {
	children: {
		baselineContext: CONTEXT_FILE_ORDER,
		checkIntegrity: CHECK_RESULT_ORDER,
		localChecks: CHECK_RESULT_ORDER,
	},
	fields: FINAL_EVIDENCE_FIELDS,
};

const RECORDED_STAGE_EVIDENCE_ORDER: JsonFieldOrder = {
	...STAGE_EVIDENCE_ORDER,
	// A parsed scorecard follows its historical schema, which places an
	// artifact before priorArtifacts rather than appending it to a session.
	fields: [
		"stage",
		"kind",
		"task",
		"productBrief",
		"instructions",
		"baselineContext",
		"taskState",
		"transcript",
		"artifact",
		"priorArtifacts",
		"diff",
		"changedPaths",
		"commitSubjects",
		"checkIntegrity",
		"localChecks",
		"harnessFailure",
	],
};

type StageEvidenceOrigin = "record" | "session";

interface FinalJudgeEvidence {
	readonly baselineContext: readonly ContextFile[];
	readonly checkIntegrity: LocalCheckResult;
	readonly diff: string;
	readonly localChecks: LocalCheckResult;
}

function finalJudgeEvidence(input: FinalJudgeEvidence): string {
	const fields = FINAL_EVIDENCE_FIELDS.map(
		(field) => [field, input[field]] as const,
	);
	const evidence = Object.fromEntries(fields);
	return orderedJson({
		json: JSON.stringify(evidence),
		order: FINAL_EVIDENCE_ORDER,
		space: 0,
	});
}

function stageJudgeEvidence(
	input: StageJudgeInput,
	origin: StageEvidenceOrigin = "session",
): string {
	return orderedJson({
		json: JSON.stringify(input),
		order:
			origin === "record"
				? RECORDED_STAGE_EVIDENCE_ORDER
				: STAGE_EVIDENCE_ORDER,
		space: 0,
	});
}

export {
	FINAL_EVIDENCE_ORDER,
	RECORDED_STAGE_EVIDENCE_ORDER,
	METRICS_ORDER,
	STAGE_EVIDENCE_ORDER,
	finalJudgeEvidence,
	stageJudgeEvidence,
};
export type { StageEvidenceOrigin };
