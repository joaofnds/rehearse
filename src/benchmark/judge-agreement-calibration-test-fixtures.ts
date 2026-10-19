import type {
	HumanReview,
	JudgeGrade,
	StageGrade,
	StageRubric,
} from "./contracts";
import type {
	JudgeAgreementCalibration,
	JudgeAgreementObservation,
} from "./judge-agreement";
import { finalRubricSha256, stageRubricSha256 } from "./judge-agreement";

const FIRST_CALIBRATION_OBSERVATION_INDEX = 0;

const stageEvidence = [
	{ claim: "fixture evidence", path: "task.md", source: "task" as const },
];
const finalEvidence = [
	{ claim: "fixture evidence", path: "change.diff", source: "diff" as const },
];
const rubric = {
	dimensions: [
		{
			description: "false positive dimension",
			excellent: "excellent",
			good: "good",
			id: "false-positive",
		},
		{
			description: "agreed passing dimension",
			excellent: "excellent",
			good: "good",
			id: "agreed-pass",
		},
	],
	hardBlockers: [{ description: "caught blocker", id: "caught" }],
	requirements: [
		{ description: "missed requirement", id: "missed" },
		{ description: "agreed failure", id: "agreed-fail" },
	],
} satisfies StageRubric;

const grade = {
	dimensions: [
		{ evidence: stageEvidence, grade: "C", id: "false-positive" },
		{ evidence: stageEvidence, grade: "A", id: "agreed-pass" },
	],
	grade: "F",
	hardBlockers: [{ evidence: stageEvidence, id: "caught", status: "FAIL" }],
	requirements: [
		{ evidence: stageEvidence, id: "missed", status: "PASS" },
		{ evidence: stageEvidence, id: "agreed-fail", status: "FAIL" },
	],
	summary: "stage grade",
	verdict: "STOP",
} satisfies StageGrade;

const finalRubric = "# Final rubric\n\n- final-missed\n- final-pass\n";

const finalGrade = {
	requirements: [
		{ evidence: finalEvidence, id: "final-missed", status: "PASS" },
		{ evidence: finalEvidence, id: "final-pass", status: "PASS" },
	],
	summary: "final grade",
	verdict: "PASS",
} satisfies JudgeGrade;

const humanReview = {
	findings: [
		{
			description: "caught",
			judgeAssessment: "CAUGHT",
			paths: ["caught.ts"],
			rubricId: "caught",
			stage: "build",
		},
		{
			description: "missed",
			judgeAssessment: "MISSED",
			paths: ["missed.ts"],
			rubricId: "missed",
			stage: "build",
		},
		{
			description: "false positive",
			judgeAssessment: "FALSE_POSITIVE",
			paths: ["false-positive.ts"],
			rubricId: "false-positive",
			stage: "build",
		},
		{
			description: "not promoted",
			judgeAssessment: "NOT_PROMOTED",
			paths: ["note.ts"],
			rubricId: null,
			stage: "build",
		},
		{
			description: "final missed",
			judgeAssessment: "MISSED",
			paths: ["final.ts"],
			rubricId: "final-missed",
			stage: "final",
		},
	],
	summary: "calibrated all decisions",
	verdict: "REJECT",
} satisfies HumanReview;
const FULL_CALIBRATION = {
	final: { grade: finalGrade, rubric: finalRubric },
	humanReview,
	judgeModel: "opus",
	stages: [{ grade, rubric, stage: "build" }],
} satisfies JudgeAgreementCalibration;
const EXPECTED_DECISIONS = [
	["build", "caught", "FAIL", "FAIL"],
	["build", "missed", "PASS", "FAIL"],
	["build", "agreed-fail", "FAIL", "FAIL"],
	["build", "false-positive", "FAIL", "PASS"],
	["build", "agreed-pass", "PASS", "PASS"],
	["final", "final-missed", "PASS", "FAIL"],
	["final", "final-pass", "PASS", "PASS"],
] as const;
const EXPECTED_CALIBRATION_OBSERVATIONS: readonly JudgeAgreementObservation[] =
	EXPECTED_DECISIONS.map(([stage, rubricId, judgeDecision, humanDecision]) => ({
		humanDecision,
		judgeDecision,
		judgeModel: "opus",
		rubricId,
		rubricSha256:
			stage === "build"
				? stageRubricSha256(rubric)
				: finalRubricSha256(finalRubric),
		stage,
	}));
const CONFLICTING_FINDINGS = [
	{
		description: "caught defect",
		judgeAssessment: "CAUGHT" as const,
		paths: ["caught.ts"],
		rubricId: "criterion",
		stage: "final" as const,
	},
	{
		description: "separate false positive",
		judgeAssessment: "FALSE_POSITIVE" as const,
		paths: ["false-positive.ts"],
		rubricId: "criterion",
		stage: "final" as const,
	},
];
function dimensionCalibration(
	dimensionGrade: StageGrade["grade"],
): JudgeAgreementCalibration {
	return {
		humanReview: {
			findings: [
				{
					description: "non-rubric note",
					judgeAssessment: "NOT_PROMOTED",
					paths: ["note.ts"],
					rubricId: "dimension",
					stage: "build",
				},
			],
			summary: "note does not alter the decision",
			verdict: "REJECT",
		},
		judgeModel: "opus",
		stages: [
			{
				grade: {
					dimensions: [
						{ evidence: stageEvidence, grade: dimensionGrade, id: "dimension" },
					],
					grade: dimensionGrade,
					hardBlockers: [],
					requirements: [],
					summary: "dimension grade",
					verdict: "STOP",
				},
				rubric: {
					dimensions: [
						{
							description: "dimension contract",
							excellent: "excellent",
							good: "good",
							id: "dimension",
						},
					],
					hardBlockers: [],
					requirements: [],
				},
				stage: "build",
			},
		],
	};
}
export {
	stageEvidence,
	finalEvidence,
	FIRST_CALIBRATION_OBSERVATION_INDEX,
	FULL_CALIBRATION,
	EXPECTED_CALIBRATION_OBSERVATIONS,
	CONFLICTING_FINDINGS,
	dimensionCalibration,
};
