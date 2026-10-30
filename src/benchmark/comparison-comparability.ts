import {
	armReps,
	assertArmCorpusSnapshot,
	assertArmDelivered,
	assertArmRanTheCase,
	assertContract,
	assertExpectedRepCount,
} from "./comparison-arm-contracts";
import {
	EMPTY_COLLECTION_LENGTH,
	projectArm,
} from "./comparison-arm-projection";
import {
	assertControlledInputs,
	controlledInputDifference,
	sameValue,
	sortedFiles,
} from "./comparison-controlled-inputs";
import { MINIMUM_PAIRED_CASES } from "./comparison-estimator";
import type {
	ComparisonArmEvidence,
	ComparisonCaseEvidence,
	ComparisonContract,
	LoadedComparisonArmGroups,
	LoadedComparisonCaseEvidence,
} from "./comparison-evidence";
import ComparisonEvidenceError from "./comparison-evidence";
import { COMPARISON_ARMS } from "./comparison-record";
import type { Immutable } from "./contracts";

interface ComparableComparison {
	readonly cases: readonly ComparisonCaseEvidence[];
	readonly contract: ComparisonContract;
}

/**
 * Reads an arm's groups as one arm. Every group must have run the arm's
 * variant on the first group's inputs and corpus, or its attempts would
 * answer another question than the arm's.
 */
interface AdditionalGroupComparison {
	readonly caseId: string;
	readonly reference: ComparisonArmEvidence;
	readonly other: ComparisonArmEvidence;
}

function assertCaseArms(
	benchmarkCase: Immutable<ComparisonCaseEvidence>,
	firstCase: Immutable<ComparisonCaseEvidence>,
): void {
	for (const role of COMPARISON_ARMS) {
		const arm = benchmarkCase.arms[role];
		assertContract({
			arm,
			caseId: benchmarkCase.caseId,
			referenceArm: firstCase.arms.baseline,
			referenceCaseId: firstCase.caseId,
		});
		assertArmRanTheCase(benchmarkCase.caseId, arm);
		assertArmDelivered(benchmarkCase.caseId, arm);
		assertExpectedRepCount(benchmarkCase.caseId, arm);
	}
	assertControlledInputs({
		caseId: benchmarkCase.caseId,
		other: benchmarkCase.arms.candidate,
		reference: benchmarkCase.arms.baseline,
	});
	assertControlledInputs({
		caseId: benchmarkCase.caseId,
		other: benchmarkCase.arms.control,
		reference: benchmarkCase.arms.baseline,
	});
}

function comparisonReferenceCase(
	cases: readonly Immutable<ComparisonCaseEvidence>[],
): Immutable<ComparisonCaseEvidence> {
	const [firstCase] = cases;
	if (firstCase === undefined) {
		throw new ComparisonEvidenceError(
			"case manifest arm all field cases requires at least one case",
		);
	}
	const referenceArm = firstCase.arms.baseline;
	if (
		cases.length < MINIMUM_PAIRED_CASES &&
		referenceArm.group.record.mode === "pipeline"
	) {
		throw new ComparisonEvidenceError(
			`case manifest arm all field cases requires at least two cases in ${referenceArm.group.record.mode} mode`,
		);
	}
	return firstCase;
}

function assertComparableComparison(
	cases: readonly Immutable<ComparisonCaseEvidence>[],
): ComparisonContract {
	const firstCase = comparisonReferenceCase(cases);
	const referenceArm = firstCase.arms.baseline;
	for (const benchmarkCase of cases) {
		assertCaseArms(benchmarkCase, firstCase);
	}
	for (const role of COMPARISON_ARMS) {
		assertArmCorpusSnapshot(cases, role);
	}
	return {
		declaredStages: referenceArm.group.record.declaredStages,
		mode: referenceArm.group.record.mode,
		reps: armReps(referenceArm),
	};
}

function groupDifference(
	caseId: string,
	reference: Immutable<ComparisonArmEvidence>,
	other: Immutable<ComparisonArmEvidence>,
): string | undefined {
	if (reference.group.record.mode !== other.group.record.mode) {
		return "mode";
	}
	if (
		!sameValue(
			reference.group.record.declaredStages,
			other.group.record.declaredStages,
		)
	) {
		return "declaredStages";
	}
	const controlled = controlledInputDifference({ caseId, other, reference });
	if (controlled !== undefined) {
		return controlled;
	}
	if (
		!sameValue(
			sortedFiles(reference.executedCorpus),
			sortedFiles(other.executedCorpus),
		)
	) {
		return "inputs.files.corpus";
	}

	return undefined;
}

function assertAdditionalGroup(
	{ caseId, other, reference }: Immutable<AdditionalGroupComparison>,
	named: Set<string>,
): void {
	if (named.has(other.group.record.groupId)) {
		throw new ComparisonEvidenceError(
			`case ${caseId} arm ${other.role} group ${other.group.path} is named twice`,
		);
	}
	named.add(other.group.record.groupId);
	assertArmRanTheCase(caseId, other);
	const field = groupDifference(caseId, reference, other);
	if (field !== undefined) {
		throw new ComparisonEvidenceError(
			`case ${caseId} arm ${other.role} group ${other.group.path} field ${field} differs from group ${reference.group.path}`,
		);
	}
}

function mergeArm(
	caseId: string,
	groups: LoadedComparisonArmGroups,
): ComparisonArmEvidence {
	const [first, ...rest] = groups;
	const reference = projectArm(caseId, first);
	const others = rest.map((group) => projectArm(caseId, group));
	const named = new Set([reference.group.record.groupId]);
	for (const other of others) {
		assertAdditionalGroup({ caseId, other, reference }, named);
	}
	if (others.length === EMPTY_COLLECTION_LENGTH) {
		return reference;
	}
	return {
		...reference,
		groups: [reference, ...others].map(({ group }) => group),
		reps: [reference, ...others].flatMap(({ reps }) => reps),
		sourcePaths: [reference, ...others].flatMap(
			({ sourcePaths }) => sourcePaths,
		),
	};
}

function buildComparableComparison(
	loadedCases: readonly LoadedComparisonCaseEvidence[],
): ComparableComparison {
	const cases = loadedCases.map((benchmarkCase) => ({
		arms: {
			baseline: mergeArm(benchmarkCase.caseId, benchmarkCase.arms.baseline),
			candidate: mergeArm(benchmarkCase.caseId, benchmarkCase.arms.candidate),
			control: mergeArm(benchmarkCase.caseId, benchmarkCase.arms.control),
		},
		caseId: benchmarkCase.caseId,
	}));

	return { cases, contract: assertComparableComparison(cases) };
}

export {
	assertComparableComparison,
	buildComparableComparison,
	type ComparableComparison,
};
