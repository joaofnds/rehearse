import {
	driftSteps,
	operatorStageLetter,
	readOperatorGrade,
	stepsApart,
} from "#benchmark/operator-grade";
import type { GradedStageRef } from "#benchmark/operator-grade";
import { oldestFirst } from "#benchmark/recorded-time";
import type {
	AgreementRow,
	CriterionDifference,
	CriterionGrades,
	DimensionDrift,
	DriftGroup,
	GradeableStage,
	GradedStage,
} from "#server/calibration-contract";
import readGradeableStage from "#server/calibration-read-gradeable-stage";
import { stageRefs } from "#server/calibration-stage-reading";

const INITIAL_DRIFT_STEP_TOTAL = 0;

const UNGRADED_RESULT_COUNT_INCREMENT = 1;

const ADJACENT_GRADE_DISTANCE = 1;

async function gradeableStages(
	runsDirectory: string,
): Promise<readonly GradeableStage[]> {
	const stages: GradeableStage[] = [];
	await Array.fromAsync(await stageRefs(runsDirectory), async (ref) => {
		const stage = await readGradeableStage(runsDirectory, ref);
		if (stage !== undefined) {
			stages.push(stage);
		}
	});

	return oldestFirst(stages, ({ recordedTime }) => recordedTime);
}

function criterionValues(
	grades: CriterionGrades,
): readonly (readonly [string, string])[] {
	return [
		...grades.hardBlockers.map(({ id, status }) => [id, status] as const),
		...grades.requirements.map(({ id, status }) => [id, status] as const),
		...grades.dimensions.map(({ id, grade }) => [id, grade] as const),
	];
}

function differences(graded: GradedStage): readonly CriterionDifference[] {
	const operatorValues = new Map(criterionValues(graded.operatorGrade));
	const judgeValues = criterionValues(graded.stage.judgeGrade);

	return judgeValues.flatMap(([criterion, judgeValue]) => {
		const operatorValue = operatorValues.get(criterion);

		return operatorValue === undefined || operatorValue === judgeValue
			? []
			: [{ criterion, judge: judgeValue, operator: operatorValue }];
	});
}

function agreementRow(graded: GradedStage): AgreementRow {
	const { stage, operatorGrade } = graded;
	const judgeLetter = stage.judgeGrade.grade;
	const operatorLetter = operatorStageLetter(operatorGrade);

	return {
		differences: differences(graded),
		judgeGrade: judgeLetter,
		judgeModel: stage.judgeModel ?? null,
		note: operatorGrade.note ?? null,
		operatorGrade: operatorLetter,
		stage: stage.ref,
		stageName: stage.stageName,
		stepsApart: stepsApart(judgeLetter, operatorLetter),
	};
}

function dimensionDrift(
	graded: readonly GradedStage[],
): readonly DimensionDrift[] {
	const differencesByDimension = new Map<string, number[]>();
	for (const { stage, operatorGrade } of graded) {
		for (const judged of stage.judgeGrade.dimensions) {
			const operated = operatorGrade.dimensions.find(
				({ id }) => id === judged.id,
			);
			if (operated !== undefined) {
				const steps = differencesByDimension.get(judged.id) ?? [];
				steps.push(driftSteps(judged.grade, operated.grade));
				differencesByDimension.set(judged.id, steps);
			}
		}
	}

	return [...differencesByDimension].map(([dimension, steps]) => ({
		dimension,
		steps:
			steps.reduce((sum, step) => sum + step, INITIAL_DRIFT_STEP_TOTAL) /
			steps.length,
	}));
}

/** A recorded contract is required before judgments can contribute to one drift figure. */
function driftGroups(graded: readonly GradedStage[]): readonly DriftGroup[] {
	const groups = new Map<
		string,
		{ readonly judgeContractSha256: string; readonly members: GradedStage[] }
	>();
	for (const entry of graded) {
		const { judgeModel, stageName, rubricSha256, judgeContractSha256 } =
			entry.stage;
		if (judgeContractSha256 !== undefined) {
			const key = JSON.stringify([
				judgeModel,
				stageName,
				rubricSha256,
				judgeContractSha256,
			]);
			const group = groups.get(key) ?? { judgeContractSha256, members: [] };
			group.members.push(entry);
			groups.set(key, group);
		}
	}

	return [...groups.values()]
		.map(({ judgeContractSha256, members }) => {
			const [first] = members;

			return {
				drift: dimensionDrift(members),
				judgeContractSha256,
				judgeModel: first?.stage.judgeModel ?? null,
				reviews: members.length,
				rubricSha256: first?.stage.rubricSha256 ?? null,
				stage: first?.stage.stageName ?? "",
			};
		})
		.toSorted((left, right) => right.reviews - left.reviews);
}

async function calibrationReport(runsDirectory: string): Promise<{
	readonly reviews: number;
	readonly withinOneStep: number;
	readonly ungraded: number;
	readonly next: GradedStageRef | null;
	readonly rows: readonly AgreementRow[];
	readonly groups: readonly DriftGroup[];
	readonly excludedUnknownJudgeReviews: number;
}> {
	const graded: GradedStage[] = [];
	let next: GradedStageRef | undefined = undefined;
	let ungraded = 0;
	await Array.fromAsync(await gradeableStages(runsDirectory), async (stage) => {
		const operatorGrade = await readOperatorGrade(runsDirectory, stage.ref);
		if (operatorGrade === undefined) {
			next ??= stage.ref;
			ungraded += UNGRADED_RESULT_COUNT_INCREMENT;
			return;
		}

		graded.push({ operatorGrade, stage });
	});
	const rows = graded.map((entry) => agreementRow(entry));

	return {
		excludedUnknownJudgeReviews: graded.filter(
			({ stage }) => stage.judgeContractSha256 === undefined,
		).length,
		groups: driftGroups(graded),
		next: next ?? null,
		reviews: rows.length,
		rows,
		ungraded,
		withinOneStep: rows.filter(
			(row) => row.stepsApart <= ADJACENT_GRADE_DISTANCE,
		).length,
	};
}

export { calibrationReport as default };
