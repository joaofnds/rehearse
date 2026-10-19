import judgeAgreementOrder from "./comparison-agreement-json-order";
import contrastsOrder from "./comparison-contrast-json-order";
import type { ComparisonReport } from "./comparison-record";
import { resourcesOrder } from "./comparison-resource-json-order";
import { digestedPathOrder, sourceOrder } from "./comparison-source-json-order";
import type { Immutable } from "./contracts";
import type { JsonFieldOrder } from "./ordered-json";
import orderedJson from "./ordered-json";

const manifestOrder: JsonFieldOrder = {
	fields: ["sha256"],
};

const reliabilitySummaryOrder: JsonFieldOrder = {
	fields: [
		"name",
		"requested",
		"attempted",
		"notReached",
		"failed",
		"successful",
		"gradeDistribution",
		"successRate",
		"standardError",
		"passK",
	],
};

const armOrder: JsonFieldOrder = {
	children: {
		executedCorpus: digestedPathOrder,
		quality: reliabilitySummaryOrder,
		resources: resourcesOrder,
		source: sourceOrder,
	},
	fields: ["role", "source", "executedCorpus", "quality", "resources"],
};

const armsOrder: JsonFieldOrder = {
	children: {
		baseline: armOrder,
		candidate: armOrder,
		control: armOrder,
	},
	fields: ["baseline", "candidate", "control"],
};

const casesOrder: JsonFieldOrder = {
	children: {
		arms: armsOrder,
	},
	fields: ["caseId", "arms"],
};

const comparisonReportOrder: JsonFieldOrder = {
	children: {
		cases: casesOrder,
		contrasts: contrastsOrder,
		judgeAgreement: judgeAgreementOrder,
		manifest: manifestOrder,
	},
	fields: [
		"schemaVersion",
		"judgeAgreement",
		"manifest",
		"mode",
		"declaredStages",
		"reps",
		"cases",
		"contrasts",
		"samplingUnit",
	],
};

function comparisonReportJson(report: Immutable<ComparisonReport>): string {
	return orderedJson({
		json: JSON.stringify(report),
		order: comparisonReportOrder,
	});
}

export { comparisonReportJson as default };
