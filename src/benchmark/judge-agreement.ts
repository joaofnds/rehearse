import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type {
	HumanReview,
	JudgeGrade,
	StageGrade,
	StageRubric,
} from "./contracts";
import {
	humanReviewSchema,
	judgeGradeSchema,
	stageGradeSchema,
	stageRubricSchema,
} from "./contracts";
import { benchmarkRunPaths } from "./run-layout";

export type AgreementDecision = "PASS" | "FAIL";

export interface JudgeAgreementObservation {
	readonly judgeModel: string;
	readonly stage: string;
	readonly rubricSha256: string;
	readonly rubricId: string;
	readonly judgeDecision: AgreementDecision;
	readonly humanDecision: AgreementDecision;
}

export interface JudgeAgreementCriterion {
	readonly rubricId: string;
	readonly sampleSize: number;
	readonly judgePassHumanPass: number;
	readonly judgeFailHumanFail: number;
	readonly judgePassHumanFail: number;
	readonly judgeFailHumanPass: number;
	readonly observedAgreement: number;
	readonly cohensKappa: number | null;
}

export interface JudgeAgreementBaseline {
	readonly judgeModel: string;
	readonly stage: string;
	readonly rubricSha256: string;
	readonly criteria: readonly JudgeAgreementCriterion[];
}

export interface JudgeAgreementReport {
	readonly skippedCalibrations: number;
	readonly baselines: readonly JudgeAgreementBaseline[];
}

const judgeAgreementCriterionSchema = z
	.object({
		rubricId: z.string().min(1),
		sampleSize: z.number().int().positive(),
		judgePassHumanPass: z.number().int().nonnegative(),
		judgeFailHumanFail: z.number().int().nonnegative(),
		judgePassHumanFail: z.number().int().nonnegative(),
		judgeFailHumanPass: z.number().int().nonnegative(),
		observedAgreement: z.number().min(0).max(1),
		cohensKappa: z.number().min(-1).max(1).nullable(),
	})
	.strict();
const judgeAgreementBaselineSchema = z
	.object({
		judgeModel: z.string().min(1),
		stage: z.string().min(1),
		rubricSha256: z.string().regex(/^[0-9a-f]{64}$/u),
		criteria: z.array(judgeAgreementCriterionSchema).min(1),
	})
	.strict();
export const judgeAgreementReportSchema = z
	.object({
		skippedCalibrations: z.number().int().nonnegative(),
		baselines: z.array(judgeAgreementBaselineSchema),
	})
	.strict();

export interface CalibratedStage {
	readonly stage: string;
	readonly rubric: StageRubric;
	readonly grade: StageGrade;
}

export interface CalibratedFinal {
	readonly rubric: string;
	readonly grade: JudgeGrade;
}

export interface JudgeAgreementCalibration {
	readonly judgeModel: string;
	readonly humanReview: HumanReview;
	readonly stages: readonly CalibratedStage[];
	readonly final?: CalibratedFinal | undefined;
}

const calibrationSchema = z.object({ humanReview: humanReviewSchema }).loose();
const calibratedStageArtifactSchema = z
	.object({
		stage: z.string().min(1),
		judgeModel: z.string().min(1).optional(),
		rubric: stageRubricSchema,
		grade: stageGradeSchema,
		calibration: calibrationSchema,
	})
	.loose();
/**
 * What the agreement baseline reads out of a stage's record: the stage it
 * graded, the rubric it graded against, and the grade. Deliberately not the
 * `stageScorecardSchema` a scorecard is parsed by, which requires five more
 * fields this needs none of, so a record lacking one still yields its grade.
 */
const gradedStageSchema = calibratedStageArtifactSchema.omit({
	judgeModel: true,
	calibration: true,
});
const calibratedFinalArtifactSchema = z
	.object({
		status: z.literal("COMPLETE"),
		judgeModel: z.string().min(1),
		rubric: z.string().min(1),
		grade: judgeGradeSchema,
		stageScorecards: z.array(gradedStageSchema),
		calibration: calibrationSchema,
	})
	.loose();
const judgeManifestSchema = z.object({ judgeModel: z.string().min(1) }).loose();
type LoadedCalibrationArtifact =
	| {
			readonly kind: "stage";
			readonly record: z.infer<typeof calibratedStageArtifactSchema>;
	  }
	| {
			readonly kind: "final";
			readonly record: z.infer<typeof calibratedFinalArtifactSchema>;
	  };

interface MutableCriterionCounts {
	judgePassHumanPass: number;
	judgeFailHumanFail: number;
	judgePassHumanFail: number;
	judgeFailHumanPass: number;
}

interface MutableBaseline {
	readonly judgeModel: string;
	readonly stage: string;
	readonly rubricSha256: string;
	readonly criteria: Map<string, MutableCriterionCounts>;
}

function compareText(left: string, right: string): number {
	if (left < right) {
		return -1;
	}
	if (left > right) {
		return 1;
	}

	return 0;
}

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

export function stageRubricSha256(rubric: StageRubric): string {
	return sha256(JSON.stringify(rubric));
}

export function finalRubricSha256(rubric: string): string {
	return sha256(rubric);
}

function humanDecision(
	review: HumanReview,
	stage: string,
	rubricId: string,
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
			judgeModel,
			stage: stage.stage,
			rubricSha256,
			rubricId,
			judgeDecision,
			humanDecision: humanDecision(
				review,
				stage.stage,
				rubricId,
				judgeDecision,
			),
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
		judgeModel,
		stage: "final",
		rubricSha256,
		rubricId,
		judgeDecision: status,
		humanDecision: humanDecision(review, "final", rubricId, status),
	}));
}

export function calibrationObservations(
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

async function readCalibrationArtifact(
	path: string,
): Promise<LoadedCalibrationArtifact | undefined> {
	try {
		const document: unknown = JSON.parse(await Bun.file(path).text());
		const stage = calibratedStageArtifactSchema.safeParse(document);
		if (stage.success) {
			return { kind: "stage", record: stage.data };
		}
		const final = calibratedFinalArtifactSchema.safeParse(document);

		return final.success ? { kind: "final", record: final.data } : undefined;
	} catch {
		return undefined;
	}
}

async function readStageScorecard(
	path: string,
): Promise<z.infer<typeof gradedStageSchema> | undefined> {
	try {
		return gradedStageSchema.parse(JSON.parse(await Bun.file(path).text()));
	} catch {
		return undefined;
	}
}

function stageRunName(fileName: string, stage: string): string | undefined {
	const suffix = `.${stage}.json`;

	return fileName.endsWith(suffix)
		? fileName.slice(0, -suffix.length)
		: undefined;
}

async function historicalStageJudgeModel(
	runsDirectory: string,
	runName: string,
): Promise<string | undefined> {
	try {
		const manifest = judgeManifestSchema.parse(
			JSON.parse(
				await Bun.file(
					benchmarkRunPaths(runsDirectory, runName).manifestFile,
				).text(),
			),
		);

		return manifest.judgeModel;
	} catch {
		return undefined;
	}
}

async function completedStageScorecards(
	runsDirectory: string,
	runName: string,
	entries: readonly { readonly name: string; readonly isFile: () => boolean }[],
): Promise<readonly CalibratedStage[]> {
	const scorecards: CalibratedStage[] = [];
	for (const entry of entries) {
		if (
			!entry.isFile() ||
			!entry.name.startsWith(`${runName}.`) ||
			!entry.name.endsWith(".json")
		) {
			continue;
		}

		const scorecard = await readStageScorecard(join(runsDirectory, entry.name));
		if (scorecard !== undefined) {
			scorecards.push(scorecard);
		}
	}

	return scorecards;
}

export async function loadJudgeAgreementReport(
	runsDirectory: string,
	currentCalibrations: readonly Readonly<JudgeAgreementCalibration>[] = [],
): Promise<JudgeAgreementReport> {
	const observations = currentCalibrations.flatMap((calibration) =>
		calibrationObservations(calibration),
	);
	let skippedCalibrations = 0;
	const entries = await readdir(runsDirectory, { withFileTypes: true }).catch(
		() => [],
	);
	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.endsWith(".json")) {
			continue;
		}

		const artifact = await readCalibrationArtifact(
			join(runsDirectory, entry.name),
		);
		if (artifact === undefined) {
			continue;
		}
		if (artifact.kind === "stage") {
			const stage = artifact.record;
			const runName = stageRunName(entry.name, stage.stage);
			if (runName === undefined) {
				skippedCalibrations += 1;
				continue;
			}
			const judgeModel =
				stage.judgeModel ??
				(await historicalStageJudgeModel(runsDirectory, runName));
			if (judgeModel === undefined) {
				skippedCalibrations += 1;
				continue;
			}

			observations.push(
				...calibrationObservations({
					judgeModel,
					humanReview: stage.calibration.humanReview,
					stages: await completedStageScorecards(
						runsDirectory,
						runName,
						entries,
					),
				}),
			);
			continue;
		}

		const final = artifact.record;
		observations.push(
			...calibrationObservations({
				judgeModel: final.judgeModel,
				humanReview: final.calibration.humanReview,
				stages: final.stageScorecards,
				final: { rubric: final.rubric, grade: final.grade },
			}),
		);
	}

	return buildJudgeAgreementReport(observations, skippedCalibrations);
}

export function filterJudgeAgreementReport(
	report: Readonly<JudgeAgreementReport>,
	judgeModels: readonly string[],
): JudgeAgreementReport {
	const included = new Set(judgeModels);

	return {
		skippedCalibrations: report.skippedCalibrations,
		baselines: report.baselines.filter(({ judgeModel }) =>
			included.has(judgeModel),
		),
	};
}

function summarizeCriterion(
	rubricId: string,
	counts: Readonly<MutableCriterionCounts>,
): JudgeAgreementCriterion {
	const sampleSize =
		counts.judgePassHumanPass +
		counts.judgeFailHumanFail +
		counts.judgePassHumanFail +
		counts.judgeFailHumanPass;
	const observedAgreement =
		(counts.judgePassHumanPass + counts.judgeFailHumanFail) / sampleSize;
	const kappaDenominator =
		(counts.judgePassHumanPass + counts.judgePassHumanFail) *
			(counts.judgePassHumanFail + counts.judgeFailHumanFail) +
		(counts.judgeFailHumanPass + counts.judgeFailHumanFail) *
			(counts.judgePassHumanPass + counts.judgeFailHumanPass);
	const cohensKappa =
		kappaDenominator === 0
			? null
			: (2 *
					(counts.judgePassHumanPass * counts.judgeFailHumanFail -
						counts.judgePassHumanFail * counts.judgeFailHumanPass)) /
				kappaDenominator;

	return {
		rubricId,
		sampleSize,
		...counts,
		observedAgreement,
		cohensKappa,
	};
}

function baselineKey(observation: Readonly<JudgeAgreementObservation>): string {
	return JSON.stringify([
		observation.judgeModel,
		observation.stage,
		observation.rubricSha256,
	]);
}

function incrementCounts(
	counts: Readonly<MutableCriterionCounts>,
	observation: Readonly<JudgeAgreementObservation>,
): MutableCriterionCounts {
	const incremented = { ...counts };
	if (observation.judgeDecision === "PASS") {
		if (observation.humanDecision === "PASS") {
			incremented.judgePassHumanPass += 1;
		} else {
			incremented.judgePassHumanFail += 1;
		}
	} else if (observation.humanDecision === "PASS") {
		incremented.judgeFailHumanPass += 1;
	} else {
		incremented.judgeFailHumanFail += 1;
	}

	return incremented;
}

export function buildJudgeAgreementReport(
	observations: readonly Readonly<JudgeAgreementObservation>[],
	skippedCalibrations: number,
): JudgeAgreementReport {
	const baselines = new Map<string, MutableBaseline>();
	for (const observation of observations) {
		const key = baselineKey(observation);
		let baseline = baselines.get(key);
		if (baseline === undefined) {
			baseline = {
				judgeModel: observation.judgeModel,
				stage: observation.stage,
				rubricSha256: observation.rubricSha256,
				criteria: new Map(),
			};
			baselines.set(key, baseline);
		}

		let counts = baseline.criteria.get(observation.rubricId);
		if (counts === undefined) {
			counts = {
				judgePassHumanPass: 0,
				judgeFailHumanFail: 0,
				judgePassHumanFail: 0,
				judgeFailHumanPass: 0,
			};
			baseline.criteria.set(observation.rubricId, counts);
		}
		baseline.criteria.set(
			observation.rubricId,
			incrementCounts(counts, observation),
		);
	}

	return {
		skippedCalibrations,
		baselines: [...baselines.values()]
			.toSorted(
				(left, right) =>
					compareText(left.judgeModel, right.judgeModel) ||
					compareText(left.stage, right.stage) ||
					compareText(left.rubricSha256, right.rubricSha256),
			)
			.map((baseline) => ({
				judgeModel: baseline.judgeModel,
				stage: baseline.stage,
				rubricSha256: baseline.rubricSha256,
				criteria: [...baseline.criteria.entries()]
					.toSorted(([left], [right]) => compareText(left, right))
					.map(([rubricId, counts]) => summarizeCriterion(rubricId, counts)),
			})),
	};
}
