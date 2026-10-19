import { describe, expect, it } from "bun:test";

import { assertComparableComparison } from "./comparison-comparability";
import {
	CORPUS_DIGESTS,
	benchmarkCase,
	pipelineBenchmarkCase,
} from "./comparison-comparability-test-fixtures";
import type { ComparisonArmEvidence } from "./comparison-evidence";

describe(assertComparableComparison.name, () => {
	it(
		"accepts corpus treatment differences with matched controlled inputs",
		acceptsCorpusTreatmentDifferencesWithMatchedControlledInputs,
	);

	it(
		"refuses a single case in pipeline mode, naming the mode",
		refusesASingleCaseInPipelineModeNamingTheMode,
	);

	it(
		"accepts a single stage case, one replayed checkpoint",
		acceptsASingleStageCaseOneReplayedCheckpoint,
	);

	it(
		"refuses a comparison naming no case at all",
		refusesAComparisonNamingNoCaseAtAll,
	);

	it(
		"accepts pipeline checkpoints derived from each corpus arm",
		acceptsPipelineCheckpointsDerivedFromEachCorpusArm,
	);

	it(
		"accepts an arm whose legacy group declared no case at all",
		acceptsAnArmWhoseLegacyGroupDeclaredNoCaseAtAll,
	);

	it(
		"accepts arms whose groups all recorded the manifest's case",
		acceptsArmsWhoseGroupsAllRecordedTheManifestSCase,
	);
});

function acceptsCorpusTreatmentDifferencesWithMatchedControlledInputs(): void {
	const cases = [
		benchmarkCase("case-1", CORPUS_DIGESTS),
		benchmarkCase("case-2", CORPUS_DIGESTS),
	];

	const contract = assertComparableComparison(cases);

	expect(contract).toEqual({
		declaredStages: ["build"],
		mode: "stage",
		reps: 2,
	});
}

function refusesASingleCaseInPipelineModeNamingTheMode(): void {
	const cases = [pipelineBenchmarkCase("case-1")];

	expect(() => assertComparableComparison(cases)).toThrow(
		"requires at least two cases in pipeline mode",
	);
}

function acceptsASingleStageCaseOneReplayedCheckpoint(): void {
	const cases = [benchmarkCase("case-1", CORPUS_DIGESTS)];

	expect(assertComparableComparison(cases).mode).toBe("stage");
}

function refusesAComparisonNamingNoCaseAtAll(): void {
	expect(() => assertComparableComparison([])).toThrow(
		"requires at least one case",
	);
}

function acceptsPipelineCheckpointsDerivedFromEachCorpusArm(): void {
	const cases = [
		pipelineBenchmarkCase("case-1"),
		pipelineBenchmarkCase("case-2"),
	];

	expect(() => assertComparableComparison(cases)).not.toThrow();
}

function acceptsAnArmWhoseLegacyGroupDeclaredNoCaseAtAll(): void {
	const first = benchmarkCase("case-1", CORPUS_DIGESTS);
	const candidate: ComparisonArmEvidence = {
		...first.arms.candidate,
		declaredCaseId: undefined,
	};

	expect(() =>
		assertComparableComparison([
			{ ...first, arms: { ...first.arms, candidate } },
			benchmarkCase("case-2", CORPUS_DIGESTS),
		]),
	).not.toThrow();
}

function acceptsArmsWhoseGroupsAllRecordedTheManifestSCase(): void {
	expect(() =>
		assertComparableComparison([
			benchmarkCase("case-1", CORPUS_DIGESTS),
			benchmarkCase("case-2", CORPUS_DIGESTS),
		]),
	).not.toThrow();
}
