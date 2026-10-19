import type { CalibrationResult } from "./contracts";
import type {
	JudgeAgreementCalibration,
	JudgeAgreementReport,
} from "./judge-agreement";

const DEFAULT_REVIEW: CalibrationResult = {
	humanReview: {
		findings: [],
		summary: "The shape stage failed.",
		verdict: "REJECT",
	},
	instructionsChanged: false,
	rubricChanged: false,
	stageRubricsChanged: [],
};
class StageCalibrationFake {
	public readonly review: CalibrationResult | undefined;
	public readonly asked: string[] = [];
	public currentCalibrations: readonly JudgeAgreementCalibration[] = [];
	public readonly agreement: JudgeAgreementReport = {
		baselines: [],
		skippedCalibrations: 0,
	};
	public constructor(props?: {
		readonly review?: CalibrationResult | undefined;
	}) {
		this.review = props === undefined ? DEFAULT_REVIEW : props.review;
	}
	public readonly calibrateStageFailure = async (): Promise<
		CalibrationResult | undefined
	> => {
		this.asked.push("calibrate");
		return await Promise.resolve(this.review);
	};
	public readonly collectJudgeAgreement = async (
		current: readonly JudgeAgreementCalibration[],
	): Promise<JudgeAgreementReport> => {
		if (this.review === undefined) {
			return await Promise.reject(
				new Error("no agreement without a calibration"),
			);
		}

		this.currentCalibrations = current;
		return await Promise.resolve(this.agreement);
	};
}
export default StageCalibrationFake;
