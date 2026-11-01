import type {
	ComparisonArmEvidence,
	DigestedComparisonRep,
} from "./comparison-evidence";
import ComparisonEvidenceError from "./comparison-evidence";
import type { ParsedConfirmationRepRecord } from "./confirmation-record";
import type { Immutable } from "./contracts";

interface JudgeIdentityComparison {
	readonly caseId: string;
	readonly arm: ComparisonArmEvidence;
	readonly contract: string;
}

function judgeContractDifference(
	reference: Immutable<ComparisonArmEvidence>,
	other: Immutable<ComparisonArmEvidence>,
): string | undefined {
	const left = reference.group.record;
	const right = other.group.record;
	if (left.mode === "session" || right.mode === "session") {
		return undefined;
	}
	if (
		left.inputs.judgeContractSha256 === undefined ||
		right.inputs.judgeContractSha256 === undefined ||
		left.inputs.judgeContractSha256 !== right.inputs.judgeContractSha256
	) {
		return "inputs.judgeContractSha256";
	}
	if (
		left.mode === "pipeline" &&
		(left.inputs.finalJudgeContractSha256 === undefined ||
			right.inputs.finalJudgeContractSha256 === undefined ||
			left.inputs.finalJudgeContractSha256 !==
				right.inputs.finalJudgeContractSha256)
	) {
		return "inputs.finalJudgeContractSha256";
	}
	return undefined;
}

function assertStageContract(
	{ caseId, arm, contract }: Immutable<JudgeIdentityComparison>,
	rep: Immutable<DigestedComparisonRep>,
	stage: Immutable<ParsedConfirmationRepRecord["stages"][number]>,
): void {
	const scorecard = rep.scorecards?.find(
		({ record }) => record.stage === stage.stage,
	);
	const stageContract =
		"judgeContractSha256" in stage ? stage.judgeContractSha256 : undefined;
	if (
		stageContract !== contract ||
		scorecard?.record.judgeContractSha256 !== contract
	) {
		throw new ComparisonEvidenceError(
			`case ${caseId} arm ${arm.role} field judgeContractSha256 is missing or inconsistent in rep ${rep.record.repId} stage ${stage.stage}`,
		);
	}
}

function assertRepJudgeContract(
	comparison: Immutable<JudgeIdentityComparison>,
	rep: Immutable<DigestedComparisonRep>,
): void {
	for (const stage of rep.record.stages) {
		if (stage.status === "JUDGED") {
			assertStageContract(comparison, rep, stage);
		} else {
			assertRecordedContract(comparison, stage);
		}
	}
	const { arm, caseId } = comparison;
	const group = arm.group.record;
	const final = rep.record.finalOutcome;
	const finalContract =
		"judgeContractSha256" in final ? final.judgeContractSha256 : undefined;
	if (
		group.mode === "pipeline" &&
		((finalContract !== undefined &&
			finalContract !== group.inputs.finalJudgeContractSha256) ||
			(final.status === "JUDGED" &&
				(finalContract !== group.inputs.finalJudgeContractSha256 ||
					rep.finalJudge?.record.judgeContractSha256 !==
						group.inputs.finalJudgeContractSha256)))
	) {
		throw new ComparisonEvidenceError(
			`case ${caseId} arm ${arm.role} field finalJudgeContractSha256 is missing or inconsistent in rep ${rep.record.repId}`,
		);
	}
}

function assertRecordedContract(
	{ arm, caseId, contract }: Immutable<JudgeIdentityComparison>,
	stage: Immutable<ParsedConfirmationRepRecord["stages"][number]>,
): void {
	if (
		"judgeContractSha256" in stage &&
		stage.judgeContractSha256 !== undefined &&
		stage.judgeContractSha256 !== contract
	) {
		throw new ComparisonEvidenceError(
			`case ${caseId} arm ${arm.role} field judgeContractSha256 is inconsistent in stage ${stage.stage}`,
		);
	}
}

function assertArmJudgeContract(
	caseId: string,
	arm: Immutable<ComparisonArmEvidence>,
): void {
	const group = arm.group.record;
	if (group.mode === "session") {
		return;
	}
	const contract = group.inputs.judgeContractSha256;
	if (contract === undefined) {
		throw new ComparisonEvidenceError(
			`case ${caseId} arm ${arm.role} field inputs.judgeContractSha256 is unknown; rerun the group to identify its Judge instructions`,
		);
	}
	for (const rep of arm.reps) {
		assertRepJudgeContract({ arm, caseId, contract }, rep);
	}
}

export { assertArmJudgeContract, judgeContractDifference };
