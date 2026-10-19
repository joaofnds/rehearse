import {
	calibrationFieldOrder,
	judgeAgreementFieldOrder,
} from "./calibration-record-json";
import {
	stageGradeFieldOrder,
	stageRubricFieldOrder,
} from "./calibration-validation-order";
import { METRICS_ORDER, STAGE_EVIDENCE_ORDER } from "./judge-evidence";
import type { JsonFieldOrder } from "./ordered-json";
import orderedJson from "./ordered-json";

const ATTEMPTS_ORDER: JsonFieldOrder = {
	children: { metrics: METRICS_ORDER },
	fields: ["payload", "costUsd", "outcome", "error", "metrics"],
};
const PROVIDER_CALLS_ORDER: JsonFieldOrder = {
	children: { metrics: METRICS_ORDER },
	fields: ["metrics"],
};
const SCORECARD_ORDER = {
	children: {
		attempts: ATTEMPTS_ORDER,
		calibration: calibrationFieldOrder,
		corpusFiles: { fields: ["path", "sha256"] },
		corpusVersion: { fields: ["kind", "digest", "refusal"] },
		grade: stageGradeFieldOrder,
		input: STAGE_EVIDENCE_ORDER,
		judgeAgreement: judgeAgreementFieldOrder,
		readManifest: { fields: ["path", "half", "role", "evidence", "sha256"] },
		rubric: stageRubricFieldOrder,
	},
	fields: [
		"stage",
		"rubricPath",
		"rubric",
		"input",
		"prompt",
		"attempts",
		"costUsd",
		"grade",
		"corpusFiles",
		"corpusVersion",
		"readManifest",
		"model",
		"judgeModel",
		"judgeEffort",
		"sessionBudgetUsd",
		"effort",
		"elapsedMs",
		"calibration",
		"judgeAgreement",
	],
} satisfies JsonFieldOrder;
const FAILED_STAGE_FIELDS: readonly string[] = [
	"status",
	"stage",
	"error",
	"input",
	"corpusFiles",
	"corpusVersion",
	"readManifest",
	"model",
	"effort",
	"judgeModel",
	"judgeEffort",
	"sessionBudgetUsd",
];
const FAILURE_CHILDREN = {
	...SCORECARD_ORDER.children,
	...stageGradeFieldOrder.children,
	grade: stageGradeFieldOrder,
	judgeProviderCalls: PROVIDER_CALLS_ORDER,
	productOwnerProviderCalls: PROVIDER_CALLS_ORDER,
};
const RECORD_ORDERS = {
	ceiling: {
		children: FAILURE_CHILDREN,
		fields: [
			"status",
			"stage",
			"error",
			"session",
			"productOwnerCostUsd",
			"productOwnerProviderCalls",
			"ceilingStop",
		],
	},
	failed: {
		children: FAILURE_CHILDREN,
		fields: [
			...FAILED_STAGE_FIELDS,
			"productOwnerCostUsd",
			"productOwnerProviderCalls",
			"prompt",
			"attempts",
			"judgeProviderCalls",
			"costUsd",
			"ceilingStop",
			"operatorStop",
		],
	},
	pending: {
		children: SCORECARD_ORDER.children,
		fields: [
			"status",
			"stage",
			"input",
			"corpusVersion",
			"model",
			"effort",
			"judgeModel",
			"judgeEffort",
			"sessionBudgetUsd",
		],
	},
	replay: {
		children: {
			consumed: { fields: ["stage", "lineage", "targetSha"] },
			corpusFiles: { fields: ["path", "sha256"] },
			corpusVersion: { fields: ["kind", "digest", "refusal"] },
			readManifest: { fields: ["path", "half", "role", "evidence", "sha256"] },
			scorecard: SCORECARD_ORDER,
			staleness: { fields: ["stage", "causes"] },
		},
		fields: [
			"replay",
			"timestamp",
			"runName",
			"stage",
			"consumed",
			"baseSha",
			"lineage",
			"corpusFiles",
			"corpusVersion",
			"settingsFile",
			"model",
			"effort",
			"judgeModel",
			"judgeEffort",
			"sessionBudgetUsd",
			"spendCeilingUsd",
			"controlSha",
			"stageCostUsd",
			"productOwnerCostUsd",
			"judgeCostUsd",
			"resultSha",
			"stale",
			"staleness",
			"scorecard",
			"elapsedMs",
			"readManifest",
		],
	},
	scorecard: SCORECARD_ORDER,
	stopped: {
		children: FAILURE_CHILDREN,
		fields: [
			...FAILED_STAGE_FIELDS,
			"hardBlockers",
			"requirements",
			"dimensions",
			"summary",
			"grade",
			"attempts",
			"costUsd",
			"minimumGrade",
			"elapsedMs",
			"runElapsedMs",
			"productOwnerCostUsd",
			"productOwnerProviderCalls",
			"ceilingStop",
			"operatorStop",
		],
	},
};

interface StageRecordSerialization {
	readonly json: string;
	readonly kind?: keyof typeof RECORD_ORDERS;
}

/** Stage files retain the byte order consumed by later evidence readers. */
function stageRecordJson({
	json,
	kind = "scorecard",
}: StageRecordSerialization): string {
	return `${orderedJson({ json, order: RECORD_ORDERS[kind] })}\n`;
}

export { stageRecordJson as default };
