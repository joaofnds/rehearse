import { describe, expect, it } from "bun:test";

import { assertComparableComparison } from "./comparison-comparability";
import {
	CHANGED_CONTROLLED_SCALARS,
	GIT_SHA_HEX_CHARACTERS,
	SHA256_HEX_CHARACTERS,
	groupRecord,
	legacyRecord,
	withChangedFile,
	withChangedScalar,
} from "./comparison-comparability-record-fixtures";
import {
	CONTROLLED_FILE_KINDS,
	CORPUS_DIGESTS,
	FIRST_REPORTED_CASE_INDEX,
	arm,
	benchmarkCase,
	pipelineBenchmarkCase,
} from "./comparison-comparability-test-fixtures";
import { NOTHING_DELIVERED } from "./corpus-delivery";

describe(assertComparableComparison.name, () => {
	it(
		"rejects changed pipeline checkpoint workflow state",
		rejectsChangedPipelineCheckpointWorkflowState,
	);

	it(
		"rejects a changed non-corpus input with both arms named",
		rejectsAChangedNonCorpusInputWithBothArmsNamed,
	);

	it.each([...CHANGED_CONTROLLED_SCALARS])(
		"rejects changed controlled scalar $field",
		rejectsChangedControlledScalar,
	);

	it.each([...CONTROLLED_FILE_KINDS])(
		"rejects changed controlled file %s",
		rejectsChangedControlledFile,
	);

	it("rejects a changed controlled lineage", rejectsAChangedControlledLineage);

	it(
		"rejects a changed corpus snapshot within one arm across cases",
		rejectsAChangedCorpusSnapshotWithinOneArmAcrossCases,
	);

	it(
		"rejects a stage arm run under the actual setup beside arms that record no setup",
		rejectsAStageArmRunUnderTheActualSetupBesideArmsThatRecordNoSetup,
	);

	it(
		"rejects a pipeline arm run under the actual setup beside arms that record no setup",
		rejectsAPipelineArmRunUnderTheActualSetupBesideArmsThatRecordNoSetup,
	);

	it(
		"rejects a stage case run under the actual setup beside one that records no setup",
		rejectsAStageCaseRunUnderTheActualSetupBesideOneThatRecordsNoSetup,
	);

	it(
		"rejects a stage arm whose corpus was delivered beside arms that read the live install",
		rejectsAStageArmWhoseCorpusWasDeliveredBesideArmsThatReadTheLiveInstall,
	);
});

function rejectsChangedPipelineCheckpointWorkflowState(): void {
	const cases = [
		pipelineBenchmarkCase("case-1"),
		pipelineBenchmarkCase("case-2"),
	];
	const [first] = cases;
	if (first === undefined) {
		throw new Error("missing fixture case");
	}
	const { candidate } = first.arms;
	cases[FIRST_REPORTED_CASE_INDEX] = {
		...first,
		arms: {
			...first.arms,
			candidate: {
				...candidate,
				controlledFiles: candidate.controlledFiles.map((file) =>
					file.kind === "checkpoint"
						? {
								kind: file.kind,
								path: file.path,
								sha256: "a".repeat(SHA256_HEX_CHARACTERS),
							}
						: file,
				),
			},
		},
	};

	expect(() => assertComparableComparison(cases)).toThrow(
		"case case-1 arms baseline and candidate field inputs.files.checkpoint",
	);
}

function rejectsAChangedNonCorpusInputWithBothArmsNamed(): void {
	const first = benchmarkCase("case-1", CORPUS_DIGESTS);
	const changedCandidate = arm(
		"candidate",
		groupRecord({
			caseId: "case-1",
			corpusDigest: CORPUS_DIGESTS.candidate,
			groupId: "case-1-candidate",
			model: "haiku",
		}),
	);
	const cases = [
		{
			arms: {
				baseline: first.arms.baseline,
				candidate: changedCandidate,
				control: first.arms.control,
			},
			caseId: first.caseId,
		},
		benchmarkCase("case-2", CORPUS_DIGESTS),
	];

	expect(() => assertComparableComparison(cases)).toThrow(
		"case case-1 arms baseline and candidate field inputs.model",
	);
}

function rejectsAChangedControlledLineage(): void {
	const first = benchmarkCase("case-1", CORPUS_DIGESTS);
	const candidateRecord = legacyRecord(first.arms.candidate.group.record);
	const changedCandidate = arm("candidate", {
		...candidateRecord,
		inputs: {
			...candidateRecord.inputs,
			lineage: { kind: "SOURCE", sha: "e".repeat(GIT_SHA_HEX_CHARACTERS) },
		},
	});

	expect(() =>
		assertComparableComparison([
			{
				...first,
				arms: { ...first.arms, candidate: changedCandidate },
			},
			benchmarkCase("case-2", CORPUS_DIGESTS),
		]),
	).toThrow("field inputs.lineage");
}

function rejectsAChangedCorpusSnapshotWithinOneArmAcrossCases(): void {
	const cases = [
		benchmarkCase("case-1", CORPUS_DIGESTS),
		benchmarkCase("case-2", {
			baseline: CORPUS_DIGESTS.baseline,
			candidate: "4".repeat(SHA256_HEX_CHARACTERS),
			control: CORPUS_DIGESTS.control,
		}),
	];

	expect(() => assertComparableComparison(cases)).toThrow(
		"case case-2 arm candidate field inputs.files.corpus differs from case case-1",
	);
}

function rejectsChangedControlledScalar({
	field,
	value,
}: (typeof CHANGED_CONTROLLED_SCALARS)[number]): void {
	const first = benchmarkCase("case-1", CORPUS_DIGESTS);
	const changedCandidate = arm(
		"candidate",
		withChangedScalar(first.arms.candidate.group.record, field, value),
	);

	expect(() =>
		assertComparableComparison([
			{
				...first,
				arms: { ...first.arms, candidate: changedCandidate },
			},
			benchmarkCase("case-2", CORPUS_DIGESTS),
		]),
	).toThrow(`field inputs.${field}`);
}

function rejectsChangedControlledFile(
	kind: (typeof CONTROLLED_FILE_KINDS)[number],
): void {
	const first = benchmarkCase("case-1", CORPUS_DIGESTS);
	const changedCandidate = arm(
		"candidate",
		withChangedFile(first.arms.candidate.group.record, kind),
	);

	expect(() =>
		assertComparableComparison([
			{
				...first,
				arms: { ...first.arms, candidate: changedCandidate },
			},
			benchmarkCase("case-2", CORPUS_DIGESTS),
		]),
	).toThrow(`field inputs.files.${kind}`);
}

function underActualSetup(
	evidence: ReturnType<typeof arm>,
): ReturnType<typeof arm> {
	const record = legacyRecord(evidence.group.record);

	return arm(evidence.role, {
		...record,
		inputs: { ...record.inputs, setup: "actual" as const },
	});
}

function rejectsAStageArmRunUnderTheActualSetupBesideArmsThatRecordNoSetup(): void {
	const first = benchmarkCase("case-1", CORPUS_DIGESTS);
	const changedCandidate = underActualSetup(first.arms.candidate);

	expect(() =>
		assertComparableComparison([
			{ ...first, arms: { ...first.arms, candidate: changedCandidate } },
			benchmarkCase("case-2", CORPUS_DIGESTS),
		]),
	).toThrow(
		"case case-1 arm candidate field setup differs from case case-1 arm baseline",
	);
}

function rejectsAPipelineArmRunUnderTheActualSetupBesideArmsThatRecordNoSetup(): void {
	const first = pipelineBenchmarkCase("case-1");
	const changedCandidate = underActualSetup(first.arms.candidate);

	expect(() =>
		assertComparableComparison([
			{ ...first, arms: { ...first.arms, candidate: changedCandidate } },
			pipelineBenchmarkCase("case-2"),
		]),
	).toThrow(
		"case case-1 arm candidate field setup differs from case case-1 arm baseline",
	);
}

function rejectsAStageArmWhoseCorpusWasDeliveredBesideArmsThatReadTheLiveInstall(): void {
	const first = benchmarkCase("case-1", CORPUS_DIGESTS);
	const record = legacyRecord(first.arms.candidate.group.record);
	const delivered = arm("candidate", {
		...record,
		inputs: {
			...record.inputs,
			corpusDelivery: { ...NOTHING_DELIVERED, redirected: 2 },
		},
	});

	expect(() =>
		assertComparableComparison([
			{ ...first, arms: { ...first.arms, candidate: delivered } },
			benchmarkCase("case-2", CORPUS_DIGESTS),
		]),
	).toThrow(
		"case case-1 arm candidate field corpusDelivery differs from case case-1 arm baseline",
	);
}

function rejectsAStageCaseRunUnderTheActualSetupBesideOneThatRecordsNoSetup(): void {
	const second = benchmarkCase("case-2", CORPUS_DIGESTS);
	const actualSecond = {
		...second,
		arms: {
			baseline: underActualSetup(second.arms.baseline),
			candidate: underActualSetup(second.arms.candidate),
			control: underActualSetup(second.arms.control),
		},
	};

	expect(() =>
		assertComparableComparison([
			benchmarkCase("case-1", CORPUS_DIGESTS),
			actualSecond,
		]),
	).toThrow(
		"case case-2 arm baseline field setup differs from case case-1 arm baseline",
	);
}
