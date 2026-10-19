import { COMPARISON_CONTRASTS } from "./comparison-estimator";
import type { ComparisonProjectionInput } from "./comparison-evidence";
import type {
	ComparisonResourcesReport,
	SingleCaseComparisonResourcesReport,
} from "./comparison-resource-contracts";
import {
	buildResourceContrast,
	buildSingleCaseResourceContrast,
} from "./comparison-resource-contrasts";
import comparisonResourceCases from "./comparison-resource-observations";
import type { Immutable } from "./contracts";

const SINGLE_ITEM_COUNT = 1;
function buildComparisonResources(
	request: Immutable<ComparisonProjectionInput>,
): ComparisonResourcesReport | SingleCaseComparisonResourcesReport {
	const cases = comparisonResourceCases(request);
	const [candidateMinusBaseline, candidateMinusControl, baselineMinusControl] =
		COMPARISON_CONTRASTS;

	if (cases.length === SINGLE_ITEM_COUNT) {
		return {
			cases,
			contrasts: {
				baselineMinusControl: buildSingleCaseResourceContrast({
					cases,
					...baselineMinusControl,
				}),
				candidateMinusBaseline: buildSingleCaseResourceContrast({
					cases,
					...candidateMinusBaseline,
				}),
				candidateMinusControl: buildSingleCaseResourceContrast({
					cases,
					...candidateMinusControl,
				}),
			},
		};
	}

	return {
		cases,
		contrasts: {
			baselineMinusControl: buildResourceContrast({
				cases,
				...baselineMinusControl,
			}),
			candidateMinusBaseline: buildResourceContrast({
				cases,
				...candidateMinusBaseline,
			}),
			candidateMinusControl: buildResourceContrast({
				cases,
				...candidateMinusControl,
			}),
		},
	};
}

export { buildComparisonResources as default };
export type {
	MetricValueSummary,
	ResourceMetricSummary,
	MissingResourceEvidence,
	AvailableArmResources,
	UnavailableArmResources,
	ArmResources,
	ComparisonResourceCase,
	ContrastMissingResourceEvidence,
	AvailableContrastResources,
	ResourceMetricEstimates,
	SingleCaseResourceMetricEstimates,
	UnavailableContrastResources,
	ContrastResources,
	ResourceContrastReport,
	AvailableSingleCaseContrastResources,
	SingleCaseContrastResources,
	SingleCaseResourceContrastReport,
	SingleCaseComparisonResourcesReport,
	ComparisonResourcesReport,
} from "./comparison-resource-contracts";
