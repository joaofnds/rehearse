import { describe, expect, it } from "bun:test";

import { assertComparableComparison } from "./comparison-comparability";
import { legacyRecord } from "./comparison-comparability-record-fixtures";
import {
	CORPUS_DIGESTS,
	PREFIX_START_INDEX,
	RETAINED_BASELINE_REP_COUNT,
	arm,
	benchmarkCase,
	casesWithChangedControl,
} from "./comparison-comparability-test-fixtures";

describe(assertComparableComparison.name, () => {
	it(
		"rejects a changed reportable group contract",
		rejectsAChangedReportableGroupContract,
	);

	it(
		"rejects a contract change in another case and arm",
		rejectsAContractChangeInAnotherCaseAndArm,
	);

	it("rejects a changed confirmation mode", rejectsAChangedConfirmationMode);

	it("rejects a changed requested rep count", rejectsAChangedRequestedRepCount);

	it(
		"rejects an arm whose group recorded a different case",
		rejectsAnArmWhoseGroupRecordedADifferentCase,
	);

	it(
		"rejects an arm without the expected rep records",
		rejectsAnArmWithoutTheExpectedRepRecords,
	);
});

function rejectsAChangedReportableGroupContract(): void {
	const cases = casesWithChangedControl({ stages: ["discuss", "build"] });

	expect(() => assertComparableComparison(cases)).toThrow(
		"case case-1 arm control field declaredStages differs from case case-1 arm baseline",
	);
}

function rejectsAContractChangeInAnotherCaseAndArm(): void {
	const first = benchmarkCase("case-1", CORPUS_DIGESTS);
	const second = benchmarkCase("case-2", CORPUS_DIGESTS);
	const { candidate } = second.arms;
	const changedCandidate = arm("candidate", {
		...legacyRecord(candidate.group.record),
		declaredStages: ["discuss", "build"],
	});

	expect(() =>
		assertComparableComparison([
			first,
			{
				...second,
				arms: { ...second.arms, candidate: changedCandidate },
			},
		]),
	).toThrow(
		"case case-2 arm candidate field declaredStages differs from case case-1 arm baseline",
	);
}

function rejectsAChangedConfirmationMode(): void {
	const cases = casesWithChangedControl({ mode: "pipeline" });

	expect(() => assertComparableComparison(cases)).toThrow(
		"case case-1 arm control field mode differs from case case-1 arm baseline",
	);
}

function rejectsAChangedRequestedRepCount(): void {
	const cases = casesWithChangedControl({ reps: 3 });

	expect(() => assertComparableComparison(cases)).toThrow(
		"case case-1 arm control field reps differs from case case-1 arm baseline",
	);
}

function rejectsAnArmWhoseGroupRecordedADifferentCase(): void {
	const first = benchmarkCase("case-1", CORPUS_DIGESTS);
	const candidate = arm("candidate", {
		...legacyRecord(first.arms.candidate.group.record),
		caseId: "case-2",
	});

	expect(() =>
		assertComparableComparison([
			{ ...first, arms: { ...first.arms, candidate } },
			benchmarkCase("case-2", CORPUS_DIGESTS),
		]),
	).toThrow(
		"case case-1 arm candidate field caseId recorded case-2; expected case-1",
	);
}

function rejectsAnArmWithoutTheExpectedRepRecords(): void {
	const first = benchmarkCase("case-1", CORPUS_DIGESTS);
	const baselineRecord = legacyRecord(first.arms.baseline.group.record);
	const baseline = arm("baseline", {
		...baselineRecord,
		repRecords: baselineRecord.repRecords.slice(
			PREFIX_START_INDEX,
			RETAINED_BASELINE_REP_COUNT,
		),
	});

	expect(() =>
		assertComparableComparison([
			{ ...first, arms: { ...first.arms, baseline } },
			benchmarkCase("case-2", CORPUS_DIGESTS),
		]),
	).toThrow("case case-1 arm baseline field repRecords has 1 reps; expected 2");
}
