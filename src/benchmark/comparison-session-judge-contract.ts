import type { ComparisonArmEvidence } from "./comparison-evidence";
import ComparisonEvidenceError from "./comparison-evidence";
import type { Immutable } from "./contracts";

const MAXIMUM_SHARED_CONTRACTS = 1;
const NO_PROVIDER_CALLS = 0;

function sessionJudgeContract(
	arm: Immutable<ComparisonArmEvidence>,
): string | undefined {
	const judges = arm.reps.flatMap(({ attempt }) =>
		attempt?.record.judge === undefined ? [] : [attempt.record.judge],
	);
	const unknown = judges.some(
		(judge) =>
			judge.providerCalls.length > NO_PROVIDER_CALLS &&
			judge.judgeContractSha256 === undefined,
	);
	const contracts = new Set(
		judges
			.map((judge) => judge.judgeContractSha256)
			.filter((digest): digest is string => digest !== undefined),
	);
	if (unknown || contracts.size > MAXIMUM_SHARED_CONTRACTS) {
		throw new ComparisonEvidenceError(
			`case ${arm.group.record.caseId ?? "legacy"} arm ${arm.role} field judgeContractSha256 is missing or inconsistent across session attempts`,
		);
	}
	return contracts.values().next().value;
}

function sessionJudgeContractDifference(
	reference: Immutable<ComparisonArmEvidence>,
	other: Immutable<ComparisonArmEvidence>,
): string | undefined {
	const left = sessionJudgeContract(reference);
	const right = sessionJudgeContract(other);
	return left !== undefined && right !== undefined && left !== right
		? "inputs.judgeContractSha256"
		: undefined;
}

export { sessionJudgeContract, sessionJudgeContractDifference };
