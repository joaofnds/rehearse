import { createHash } from "node:crypto";

import type { HumanReview, StageGrade, StageRubric } from "./contracts";
import type {
	AgreementDecision,
	CalibratedFinal,
	CalibratedStage,
	JudgeAgreementCalibration,
	JudgeAgreementObservation,
} from "./judge-agreement-contract";

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function stageRubricSha256(rubric: StageRubric): string {
	return sha256(
		JSON.stringify(rubric, [
			"hardBlockers",
			"requirements",
			"dimensions",
			"id",
			"description",
			"good",
			"excellent",
		]),
	);
}

function finalRubricSha256(rubric: string): string {
	return sha256(rubric);
}

interface HumanDecisionCriterion {
	readonly stage: string;
	readonly rubricId: string;
}

function humanDecision(
	review: HumanReview,
	{ stage, rubricId }: HumanDecisionCriterion,
	judgeDecision: AgreementDecision,
): AgreementDecision {
	const assessments = review.findings
		.filter(
			(candidate) =>
				candidate.stage === stage && candidate.rubricId === rubricId,
		)
		.map(({ judgeAssessment }) => judgeAssessment);
	if (
		assessments.some(
			(assessment) => assessment === "CAUGHT" || assessment === "MISSED",
		)
	) {
		return "FAIL";
	}

	if (assessments.includes("FALSE_POSITIVE")) {
		return "PASS";
	}

	return judgeDecision;
}

function stageDecision(grade: StageGrade, rubricId: string): AgreementDecision {
	const blocker = grade.hardBlockers.find(({ id }) => id === rubricId);
	if (blocker !== undefined) {
		return blocker.status;
	}

	const requirement = grade.requirements.find(({ id }) => id === rubricId);
	if (requirement !== undefined) {
		return requirement.status;
	}

	const dimension = grade.dimensions.find(({ id }) => id === rubricId);
	if (dimension !== undefined) {
		return dimension.grade === "A" || dimension.grade === "B" ? "PASS" : "FAIL";
	}

	throw new Error(`Stage grade is missing rubric criterion ${rubricId}`);
}

function stageObservations(
	judgeModel: string,
	review: HumanReview,
	stage: Readonly<CalibratedStage>,
): readonly JudgeAgreementObservation[] {
	const rubricSha256 = stageRubricSha256(stage.rubric);
	const rubricIds = [
		...stage.rubric.hardBlockers,
		...stage.rubric.requirements,
		...stage.rubric.dimensions,
	].map(({ id }) => id);

	return rubricIds.map((rubricId) => {
		const judgeDecision = stageDecision(stage.grade, rubricId);

		return {
			humanDecision: humanDecision(
				review,
				{ rubricId, stage: stage.stage },
				judgeDecision,
			),
			judgeDecision,
			judgeModel,
			rubricId,
			rubricSha256,
			stage: stage.stage,
		};
	});
}

function finalObservations(
	judgeModel: string,
	review: HumanReview,
	final: Readonly<CalibratedFinal>,
): readonly JudgeAgreementObservation[] {
	const rubricSha256 = finalRubricSha256(final.rubric);

	return final.grade.requirements.map(({ id: rubricId, status }) => ({
		humanDecision: humanDecision(review, { rubricId, stage: "final" }, status),
		judgeDecision: status,
		judgeModel,
		rubricId,
		rubricSha256,
		stage: "final",
	}));
}

function calibrationObservations(
	input: Readonly<JudgeAgreementCalibration>,
): readonly JudgeAgreementObservation[] {
	const stages = input.stages.flatMap((stage) =>
		stageObservations(input.judgeModel, input.humanReview, stage),
	);
	if (input.final === undefined) {
		return stages;
	}

	return [
		...stages,
		...finalObservations(input.judgeModel, input.humanReview, input.final),
	];
}

export {
	stageRubricSha256,
	finalRubricSha256,
	humanDecision,
	calibrationObservations,
};
