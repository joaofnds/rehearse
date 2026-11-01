import { describe, expect, it } from "bun:test";

import { assertComparableComparison } from "./comparison-comparability";
import {
	SHA256_HEX_CHARACTERS,
	groupRecord,
	legacyRecord,
} from "./comparison-comparability-record-fixtures";
import {
	CORPUS_DIGESTS,
	arm,
	benchmarkCase,
} from "./comparison-comparability-test-fixtures";
import { controlledInputDifference } from "./comparison-controlled-inputs";
import type { ComparisonArmEvidence } from "./comparison-evidence";
import type { Immutable } from "./contracts";

const CONTRACT_A = "a".repeat(SHA256_HEX_CHARACTERS);
const CONTRACT_B = "b".repeat(SHA256_HEX_CHARACTERS);

function stageArm(
	judgeContractSha256: string | undefined,
): ComparisonArmEvidence {
	const record = groupRecord({
		caseId: "case-1",
		corpusDigest: CORPUS_DIGESTS.baseline,
		groupId: "contract-test",
	});
	const inputs = { ...record.inputs, judgeContractSha256 };

	return arm("baseline", { ...record, inputs });
}

describe("comparison Judge identity", () => {
	it("refuses different Judge instructions with otherwise equal inputs", () => {
		expect(
			controlledInputDifference({
				caseId: "case-1",
				other: stageArm(CONTRACT_B),
				reference: stageArm(CONTRACT_A),
			}),
		).toBe("inputs.judgeContractSha256");
	});

	it("accepts the same known Judge instructions", () => {
		expect(
			controlledInputDifference({
				caseId: "case-1",
				other: stageArm(CONTRACT_A),
				reference: stageArm(CONTRACT_A),
			}),
		).toBeUndefined();
	});

	it.each([
		[undefined, undefined],
		[CONTRACT_A, undefined],
		[undefined, CONTRACT_A],
	])("refuses unknown Judge identity (%s, %s)", (reference, other) => {
		expect(
			controlledInputDifference({
				caseId: "case-1",
				other: stageArm(other),
				reference: stageArm(reference),
			}),
		).toBe("inputs.judgeContractSha256");
	});
});

describe("comparison Judge identity across cases", () => {
	it("refuses a different Judge contract across cases", () => {
		const first = benchmarkCase("case-1", CORPUS_DIGESTS);
		const second = benchmarkCase("case-2", CORPUS_DIGESTS);
		const changed = (
			evidence: Immutable<ComparisonArmEvidence>,
		): ComparisonArmEvidence => {
			const record = legacyRecord(evidence.group.record);
			const inputs = { ...record.inputs, judgeContractSha256: CONTRACT_B };
			return arm(evidence.role, { ...record, inputs });
		};
		const arms = {
			baseline: changed(second.arms.baseline),
			candidate: changed(second.arms.candidate),
			control: changed(second.arms.control),
		};

		expect(() =>
			assertComparableComparison([{ ...first }, { ...second, arms }]),
		).toThrow("judgeContractSha256");
	});
});
