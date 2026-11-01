import { z } from "zod";

import type {
	HumanReview,
	JudgeGrade,
	StageGrade,
	StageRubric,
} from "./contracts";
import judgeContractSha256Schema from "./judge-contract-schema";

const MAXIMUM_AGREEMENT = 1;

const MINIMUM_AGREEMENT = 0;

const MAXIMUM_KAPPA = 1;

const MINIMUM_KAPPA = -1;

type AgreementDecision = "PASS" | "FAIL";

interface JudgeAgreementObservation {
	readonly judgeContractSha256?: string | undefined;
	readonly judgeModel: string;
	readonly stage: string;
	readonly rubricSha256: string;
	readonly rubricId: string;
	readonly judgeDecision: AgreementDecision;
	readonly humanDecision: AgreementDecision;
}

interface JudgeAgreementCriterion {
	readonly rubricId: string;
	readonly sampleSize: number;
	readonly judgePassHumanPass: number;
	readonly judgeFailHumanFail: number;
	readonly judgePassHumanFail: number;
	readonly judgeFailHumanPass: number;
	readonly observedAgreement: number;
	readonly cohensKappa: number | null;
}

interface JudgeAgreementBaseline {
	readonly judgeContractSha256?: string | undefined;
	readonly judgeModel: string;
	readonly stage: string;
	readonly rubricSha256: string;
	readonly criteria: readonly JudgeAgreementCriterion[];
}

interface JudgeAgreementReport {
	readonly skippedUnknownJudgeObservations?: number | undefined;
	readonly skippedCalibrations: number;
	readonly baselines: readonly JudgeAgreementBaseline[];
}

const judgeAgreementCriterionSchema = z
	.object({
		cohensKappa: z.number().min(MINIMUM_KAPPA).max(MAXIMUM_KAPPA).nullable(),
		judgeFailHumanFail: z.number().int().nonnegative(),
		judgeFailHumanPass: z.number().int().nonnegative(),
		judgePassHumanFail: z.number().int().nonnegative(),
		judgePassHumanPass: z.number().int().nonnegative(),
		observedAgreement: z.number().min(MINIMUM_AGREEMENT).max(MAXIMUM_AGREEMENT),
		rubricId: z.string().nonempty(),
		sampleSize: z.number().int().positive(),
	})
	.strict();

const judgeAgreementBaselineSchema = z
	.object({
		criteria: z.array(judgeAgreementCriterionSchema).nonempty(),
		judgeContractSha256: judgeContractSha256Schema.optional(),
		judgeModel: z.string().nonempty(),
		rubricSha256: z.string().regex(/^[0-9a-f]{64}$/u),
		stage: z.string().nonempty(),
	})
	.strict();

const judgeAgreementReportSchema = z
	.object({
		baselines: z.array(judgeAgreementBaselineSchema),
		skippedCalibrations: z.number().int().nonnegative(),
		skippedUnknownJudgeObservations: z.number().int().nonnegative().optional(),
	})
	.strict();

interface CalibratedStage {
	readonly judgeContractSha256?: string | undefined;
	readonly stage: string;
	readonly rubric: StageRubric;
	readonly grade: StageGrade;
}

interface CalibratedFinal {
	readonly judgeContractSha256?: string | undefined;
	readonly rubric: string;
	readonly grade: JudgeGrade;
}

interface JudgeAgreementCalibration {
	readonly judgeModel: string;
	readonly humanReview: HumanReview;
	readonly stages: readonly CalibratedStage[];
	readonly final?: CalibratedFinal | undefined;
}

export { judgeAgreementReportSchema as default };
export type {
	AgreementDecision,
	JudgeAgreementObservation,
	JudgeAgreementCriterion,
	JudgeAgreementBaseline,
	JudgeAgreementReport,
	CalibratedStage,
	CalibratedFinal,
	JudgeAgreementCalibration,
};
