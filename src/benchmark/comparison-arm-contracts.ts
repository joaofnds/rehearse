import {
	deliveryRules,
	sameValue,
	setupKinds,
	sortedFiles,
} from "./comparison-controlled-inputs";
import type {
	ComparisonArmEvidence,
	ComparisonCaseEvidence,
} from "./comparison-evidence";
import ComparisonEvidenceError from "./comparison-evidence";
import type { ComparisonArm } from "./comparison-record";
import type { Immutable } from "./contracts";

const EMPTY_COUNT_TOTAL = 0;

const UNDELIVERED = "none";

interface ContractComparison {
	readonly caseId: string;
	readonly arm: ComparisonArmEvidence;
	readonly referenceCaseId: string;
	readonly referenceArm: ComparisonArmEvidence;
}

function contractDifference(
	comparison: Immutable<ContractComparison>,
): string | undefined {
	const reference = comparison.referenceArm.group.record;
	const other = comparison.arm.group.record;
	if (reference.mode !== other.mode) {
		return "mode";
	}
	if (!sameValue(reference.declaredStages, other.declaredStages)) {
		return "declaredStages";
	}

	return repDifference(comparison);
}

function repDifference(
	comparison: Immutable<ContractComparison>,
): string | undefined {
	if (armReps(comparison.referenceArm) !== armReps(comparison.arm)) {
		return "reps";
	}
	if (setupKinds(comparison.referenceArm) !== setupKinds(comparison.arm)) {
		return "setup";
	}
	if (
		deliveryRules(comparison.referenceArm) !== deliveryRules(comparison.arm)
	) {
		return "corpusDelivery";
	}

	return undefined;
}

function assertContract(comparison: Immutable<ContractComparison>): void {
	const field = contractDifference(comparison);
	if (field === undefined) {
		return;
	}

	throw new ComparisonEvidenceError(
		`case ${comparison.caseId} arm ${comparison.arm.role} field ${field} differs from case ${comparison.referenceCaseId} arm ${comparison.referenceArm.role}`,
	);
}

/**
 * The manifest names which declared case each triple of arms ran. A group that
 * recorded a different case answers a different question, so pairing it as an
 * arm of this case would contrast two tasks and call the difference a corpus
 * effect. A group written before cases were declared recorded no case at all,
 * which claims nothing and so contradicts nothing.
 */
function assertArmRanTheCase(
	caseId: string,
	arm: Immutable<ComparisonArmEvidence>,
): void {
	const recorded = arm.declaredCaseId;
	if (recorded === undefined || recorded === caseId) {
		return;
	}

	throw new ComparisonEvidenceError(
		`case ${caseId} arm ${arm.role} field caseId recorded ${recorded}; expected ${caseId}`,
	);
}

/**
 * An arm recorded before delivery let its home-path citations read the live
 * install, so it cannot say which bytes its sessions read, even beside arms
 * just as old.
 */
function assertArmDelivered(
	caseId: string,
	arm: Immutable<ComparisonArmEvidence>,
): void {
	if (!deliveryRules(arm).split(",").includes(UNDELIVERED)) {
		return;
	}

	throw new ComparisonEvidenceError(
		`case ${caseId} arm ${arm.role} records no corpus delivery, so its home-path citations read the live install and it cannot be compared until it is run again`,
	);
}

function assertExpectedRepCount(
	caseId: string,
	arm: Immutable<ComparisonArmEvidence>,
): void {
	for (const { record } of arm.groups) {
		const actual = record.repRecords.length;
		const expected = record.reps;
		if (actual !== expected) {
			throw new ComparisonEvidenceError(
				`case ${caseId} arm ${arm.role} field repRecords has ${actual} reps; expected ${expected}`,
			);
		}
	}
}

/** The attempts an arm's groups set out to record, together. */
function armReps(arm: Immutable<ComparisonArmEvidence>): number {
	return arm.groups.reduce(
		(total, { record }) => total + record.reps,
		EMPTY_COUNT_TOTAL,
	);
}

function assertArmCorpusSnapshot(
	cases: readonly Immutable<ComparisonCaseEvidence>[],
	role: ComparisonArm,
): void {
	const [reference, ...others] = cases;
	if (reference === undefined) {
		return;
	}

	const referenceSnapshot = sortedFiles(reference.arms[role].executedCorpus);
	for (const benchmarkCase of others) {
		const snapshot = sortedFiles(benchmarkCase.arms[role].executedCorpus);
		if (!sameValue(referenceSnapshot, snapshot)) {
			throw new ComparisonEvidenceError(
				`case ${benchmarkCase.caseId} arm ${role} field inputs.files.corpus differs from case ${reference.caseId}`,
			);
		}
	}
}

export {
	armReps,
	assertArmCorpusSnapshot,
	assertArmDelivered,
	assertArmRanTheCase,
	assertContract,
	assertExpectedRepCount,
};
