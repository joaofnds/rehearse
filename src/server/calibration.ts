import { basename } from "node:path";
import { Hono } from "hono";
import { z } from "zod";
import type { Immutable, StageLetterGrade } from "#benchmark/contracts";
import {
	stageLetterGradeSchema,
	stageRubricSchema,
	unhandled,
} from "#benchmark/contracts";
import { jsonValueSchema } from "#benchmark/json-value";
import { stageRubricSha256 } from "#benchmark/judge-agreement";
import { oldestFirst } from "#benchmark/recorded-time";
import type { GradedStageRef, OperatorGrade } from "#benchmark/operator-grade";
import {
	driftSteps,
	OperatorGradeExistsError,
	operatorGradeSchema,
	operatorStageLetter,
	readOperatorGrade,
	stepsApart,
	writeOperatorGrade,
} from "#benchmark/operator-grade";
import {
	benchmarkRunPaths,
	confirmationGroupIds,
	confirmationGroupPaths,
	confirmationRepIds,
	confirmationRepStageNames,
	recordedRunNames,
	replayAttemptIds,
	replayRecordFile,
	runStageFiles,
} from "#benchmark/run-layout";
import {
	parseIdentity,
	SessionHistoryReaderError,
} from "./session-history-reader";
import { judgedGradeSchema } from "./stage-record";

export interface CalibrationDependencies {
	readonly runsDirectory: string;
}

/** A malformed request is 400, a stage that is not there 404, and a stage already graded 409. */
class CalibrationRefusalError extends Error {
	public override name = "CalibrationRefusalError";

	public constructor(
		public readonly status: 400 | 404 | 409,
		message: string,
	) {
		super(message);
	}
}

const judgeGradeSchema = judgedGradeSchema.extend({
	summary: z.string(),
	grade: stageLetterGradeSchema,
});

type JudgeGrade = Immutable<z.infer<typeof judgeGradeSchema>>;

/** Each input field as the operator reads it: a string as recorded, anything else as indented JSON. */
const inputTextSchema = z.record(
	z.string(),
	z.union([
		z.string(),
		jsonValueSchema.transform((value) => JSON.stringify(value, null, 2)),
	]),
);

const scorecardSchema = z.looseObject({
	judgeModel: z.string().min(1).optional(),
	rubric: stageRubricSchema,
	input: inputTextSchema,
	grade: judgeGradeSchema,
});

/** A stage that stopped the run keeps its judged items at the top level and records no rubric. */
const stopRecordSchema = judgedGradeSchema.extend({
	status: z.literal("STAGE_JUDGE_FAILED"),
	judgeModel: z.string().min(1).optional(),
	input: inputTextSchema,
	summary: z.string(),
	grade: z.looseObject({ grade: stageLetterGradeSchema }),
});

const manifestJudgeModelSchema = z
	.looseObject({ judgeModel: z.string().min(1) })
	.transform(({ judgeModel }) => judgeModel);

const groupJudgeModelSchema = z
	.looseObject({ inputs: z.looseObject({ judgeModel: z.string().min(1) }) })
	.transform(({ inputs }) => inputs.judgeModel);

const groupStartedAtSchema = z
	.looseObject({ startedAt: z.iso.datetime() })
	.transform(({ startedAt }) => startedAt);

interface Criterion {
	readonly id: string;
	readonly description?: string;
}

interface DimensionCriterion extends Criterion {
	readonly good?: string;
	readonly excellent?: string;
}

/** What the operator grades: the rubric's criteria, or only their ids where the record kept no rubric. */
interface StageCriteria {
	readonly hardBlockers: readonly Criterion[];
	readonly requirements: readonly Criterion[];
	readonly dimensions: readonly DimensionCriterion[];
}

interface JudgedStage {
	readonly judgeModel: string | undefined;
	readonly rubricSha256: string | undefined;
	readonly criteria: StageCriteria;
	readonly input: Readonly<Record<string, string>>;
	readonly judgeGrade: JudgeGrade;
}

/** A stage whose record carries a Judge letter, which is what makes it gradeable. */
interface GradeableStage extends JudgedStage {
	readonly ref: GradedStageRef;
	readonly stageName: string;
	/** The run's or replay's own time; a confirmation group records none. */
	readonly recordedTime: string | undefined;
}

const judgedStageSchema = z.union([
	stopRecordSchema.transform((stop): JudgedStage => ({
		judgeModel: stop.judgeModel,
		rubricSha256: undefined,
		criteria: {
			hardBlockers: stop.hardBlockers.map(({ id }) => ({ id })),
			requirements: stop.requirements.map(({ id }) => ({ id })),
			dimensions: stop.dimensions.map(({ id }) => ({ id })),
		},
		input: stop.input,
		judgeGrade: {
			hardBlockers: stop.hardBlockers,
			requirements: stop.requirements,
			dimensions: stop.dimensions,
			summary: stop.summary,
			grade: stop.grade.grade,
		},
	})),
	scorecardSchema.transform((scorecard): JudgedStage => ({
		judgeModel: scorecard.judgeModel,
		rubricSha256: stageRubricSha256(scorecard.rubric),
		criteria: scorecard.rubric,
		input: scorecard.input,
		judgeGrade: scorecard.grade,
	})),
]);

const replayScorecardSchema = z.looseObject({
	judgeModel: z.string().min(1),
	stage: z.string().min(1),
	scorecard: judgedStageSchema,
});

/**
 * A record that is not there, is not JSON, or is not the shape asked for
 * holds nothing to grade: a stage whose judging never returned a letter is
 * one of those.
 */
async function readRecord<Recorded>(
	path: string,
	schema: z.ZodType<Recorded>,
): Promise<Recorded | undefined> {
	const file = Bun.file(path);
	if (!(await file.exists())) {
		return undefined;
	}

	let document: unknown;
	try {
		document = JSON.parse(await file.text());
	} catch (error) {
		if (!(error instanceof SyntaxError)) {
			throw error;
		}

		return undefined;
	}
	const parsed = schema.safeParse(document);

	return parsed.success ? parsed.data : undefined;
}

async function readGradeableStage(
	runsDirectory: string,
	ref: GradedStageRef,
): Promise<GradeableStage | undefined> {
	switch (ref.kind) {
		case "run": {
			const paths = benchmarkRunPaths(runsDirectory, ref.run);
			const judged = await readRecord(
				paths.stageFile(ref.stage),
				judgedStageSchema,
			);
			if (judged === undefined) {
				return undefined;
			}

			return {
				...judged,
				judgeModel:
					judged.judgeModel ??
					(await readRecord(paths.manifestFile, manifestJudgeModelSchema)),
				ref,
				stageName: ref.stage,
				recordedTime: ref.run,
			};
		}
		case "rep": {
			const group = confirmationGroupPaths(runsDirectory, ref.groupId);
			const judged = await readRecord(
				group.rep(ref.repId).stageFile(ref.stage),
				judgedStageSchema,
			);
			if (judged === undefined) {
				return undefined;
			}

			return {
				...judged,
				judgeModel:
					judged.judgeModel ??
					(await readRecord(group.groupFile, groupJudgeModelSchema)),
				ref,
				stageName: ref.stage,
				recordedTime: await readRecord(group.groupFile, groupStartedAtSchema),
			};
		}
		case "replay": {
			const replay = await readRecord(
				replayRecordFile(runsDirectory, ref.lineage, ref.timestamp),
				replayScorecardSchema,
			);
			if (replay === undefined) {
				return undefined;
			}

			return {
				...replay.scorecard,
				judgeModel: replay.judgeModel,
				ref,
				stageName: replay.stage,
				recordedTime: ref.timestamp,
			};
		}
		default: {
			return unhandled(ref, "graded stage kind");
		}
	}
}

async function stageRefs(
	runsDirectory: string,
): Promise<readonly GradedStageRef[]> {
	const refs: GradedStageRef[] = [];
	for (const run of await recordedRunNames(runsDirectory)) {
		for (const file of await runStageFiles(runsDirectory, run)) {
			const stage = basename(file).slice(run.length + 1, -".json".length);
			refs.push({ kind: "run", run, stage });
		}
	}
	for (const groupId of await confirmationGroupIds(runsDirectory)) {
		for (const repId of await confirmationRepIds(runsDirectory, groupId)) {
			for (const stage of await confirmationRepStageNames(
				runsDirectory,
				groupId,
				repId,
			)) {
				refs.push({ kind: "rep", groupId, repId, stage });
			}
		}
	}
	for (const { lineage, timestamp } of await replayAttemptIds(runsDirectory)) {
		refs.push({ kind: "replay", lineage, timestamp });
	}

	return refs;
}

async function gradeableStages(
	runsDirectory: string,
): Promise<readonly GradeableStage[]> {
	const stages: GradeableStage[] = [];
	for (const ref of await stageRefs(runsDirectory)) {
		const stage = await readGradeableStage(runsDirectory, ref);
		if (stage !== undefined) {
			stages.push(stage);
		}
	}

	return oldestFirst(stages, ({ recordedTime }) => recordedTime);
}

interface GradedStage {
	readonly stage: GradeableStage;
	readonly operatorGrade: OperatorGrade;
}

interface CriterionDifference {
	readonly criterion: string;
	readonly judge: string;
	readonly operator: string;
}

interface CriterionGrades {
	readonly hardBlockers: readonly {
		readonly id: string;
		readonly status: string;
	}[];
	readonly requirements: readonly {
		readonly id: string;
		readonly status: string;
	}[];
	readonly dimensions: readonly {
		readonly id: string;
		readonly grade: string;
	}[];
}

/** Each criterion's id with its status or letter, in rubric order. */
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

interface AgreementRow {
	readonly stage: GradedStageRef;
	readonly stageName: string;
	readonly judgeModel: string | null;
	readonly judgeGrade: StageLetterGrade;
	readonly operatorGrade: StageLetterGrade;
	readonly stepsApart: number;
	readonly differences: readonly CriterionDifference[];
	readonly note: string | null;
}

function agreementRow(graded: GradedStage): AgreementRow {
	const { stage, operatorGrade } = graded;
	const judgeLetter = stage.judgeGrade.grade;
	const operatorLetter = operatorStageLetter(operatorGrade);

	return {
		stage: stage.ref,
		stageName: stage.stageName,
		judgeModel: stage.judgeModel ?? null,
		judgeGrade: judgeLetter,
		operatorGrade: operatorLetter,
		stepsApart: stepsApart(judgeLetter, operatorLetter),
		differences: differences(graded),
		note: operatorGrade.note ?? null,
	};
}

interface DimensionDrift {
	readonly dimension: string;
	readonly steps: number;
}

interface DriftGroup {
	readonly judgeModel: string | null;
	readonly stage: string;
	readonly rubricSha256: string | null;
	readonly reviews: number;
	readonly drift: readonly DimensionDrift[];
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
			if (operated === undefined) {
				continue;
			}
			const steps = differencesByDimension.get(judged.id) ?? [];
			steps.push(driftSteps(judged.grade, operated.grade));
			differencesByDimension.set(judged.id, steps);
		}
	}

	return [...differencesByDimension].map(([dimension, steps]) => ({
		dimension,
		steps: steps.reduce((sum, step) => sum + step, 0) / steps.length,
	}));
}

/** Grouped by Judge model, stage and rubric, as the binary baseline groups, so one figure never blends two Judges. */
function driftGroups(graded: readonly GradedStage[]): readonly DriftGroup[] {
	const groups = new Map<string, GradedStage[]>();
	for (const entry of graded) {
		const { judgeModel, stageName, rubricSha256 } = entry.stage;
		const key = JSON.stringify([judgeModel, stageName, rubricSha256]);
		const members = groups.get(key) ?? [];
		members.push(entry);
		groups.set(key, members);
	}

	return [...groups.values()]
		.map((members) => {
			const [first] = members;

			return {
				judgeModel: first?.stage.judgeModel ?? null,
				stage: first?.stage.stageName ?? "",
				rubricSha256: first?.stage.rubricSha256 ?? null,
				reviews: members.length,
				drift: dimensionDrift(members),
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
}> {
	const graded: GradedStage[] = [];
	let next: GradedStageRef | undefined;
	let ungraded = 0;
	for (const stage of await gradeableStages(runsDirectory)) {
		const operatorGrade = await readOperatorGrade(runsDirectory, stage.ref);
		if (operatorGrade === undefined) {
			next ??= stage.ref;
			ungraded += 1;
			continue;
		}
		graded.push({ stage, operatorGrade });
	}
	const rows = graded.map((entry) => agreementRow(entry));

	return {
		reviews: rows.length,
		withinOneStep: rows.filter((row) => row.stepsApart <= 1).length,
		ungraded,
		next: next ?? null,
		rows,
		groups: driftGroups(graded),
	};
}

function confined(value: string): string {
	try {
		return parseIdentity(value);
	} catch (error) {
		if (!(error instanceof SessionHistoryReaderError)) {
			throw error;
		}

		throw new CalibrationRefusalError(400, `${value} names no recorded stage`);
	}
}

function sameRef(left: GradedStageRef, right: GradedStageRef): boolean {
	switch (left.kind) {
		case "run": {
			return (
				right.kind === "run" &&
				right.run === left.run &&
				right.stage === left.stage
			);
		}
		case "rep": {
			return (
				right.kind === "rep" &&
				right.groupId === left.groupId &&
				right.repId === left.repId &&
				right.stage === left.stage
			);
		}
		case "replay": {
			return (
				right.kind === "replay" &&
				right.lineage === left.lineage &&
				right.timestamp === left.timestamp
			);
		}
		default: {
			return unhandled(left, "graded stage kind");
		}
	}
}

/**
 * Only a stage the records list: a run name holds a dot, so a run and stage
 * split at another dot would read the same record and key a second grade.
 */
async function requiredStage(
	runsDirectory: string,
	ref: GradedStageRef,
): Promise<GradeableStage> {
	const refs = await stageRefs(runsDirectory);
	const listed = refs.some((each) => sameRef(each, ref));
	const stage = listed
		? await readGradeableStage(runsDirectory, ref)
		: undefined;
	if (stage === undefined) {
		throw new CalibrationRefusalError(
			404,
			"No stage the Judge graded is recorded there",
		);
	}

	return stage;
}

function gradedLetter(grade: OperatorGrade): OperatorGrade & {
	readonly grade: StageLetterGrade;
} {
	return { ...grade, grade: operatorStageLetter(grade) };
}

/**
 * Before the operator grades, only the frozen input the Judge read and the
 * rubric's criteria: a grade given after seeing anything the Judge returned
 * measures anchoring rather than how far to trust a grade.
 */
async function stageReview(
	runsDirectory: string,
	ref: GradedStageRef,
): Promise<{
	readonly stage: GradedStageRef;
	readonly stageName: string;
	readonly judgeModel: string | null;
	readonly criteria: StageCriteria;
	readonly input: Readonly<Record<string, string>>;
	readonly operatorGrade?: ReturnType<typeof gradedLetter>;
	readonly judgeGrade?: JudgeGrade;
}> {
	const stage = await requiredStage(runsDirectory, ref);
	const operatorGrade = await readOperatorGrade(runsDirectory, ref);
	const form = {
		stage: ref,
		stageName: stage.stageName,
		judgeModel: stage.judgeModel ?? null,
		criteria: stage.criteria,
		input: stage.input,
	};

	return operatorGrade === undefined
		? form
		: {
				...form,
				operatorGrade: gradedLetter(operatorGrade),
				judgeGrade: stage.judgeGrade,
			};
}

function sameIds(
	given: readonly { readonly id: string }[],
	expected: readonly { readonly id: string }[],
): boolean {
	const ids = given.map(({ id }) => id);

	return (
		ids.length === expected.length &&
		new Set(ids).size === ids.length &&
		expected.every(({ id }) => ids.includes(id))
	);
}

/** The request body as sent, parsed here because a grade is the one thing the operator writes. */
function operatorGradeFrom(body: string): OperatorGrade {
	let document: unknown;
	try {
		document = JSON.parse(body);
	} catch (error) {
		if (!(error instanceof SyntaxError)) {
			throw error;
		}

		throw new CalibrationRefusalError(400, "The grade is not JSON");
	}
	const parsed = operatorGradeSchema.safeParse(document);
	if (!parsed.success) {
		throw new CalibrationRefusalError(400, z.prettifyError(parsed.error));
	}

	return parsed.data;
}

async function recordOperatorGrade(
	runsDirectory: string,
	ref: GradedStageRef,
	grade: OperatorGrade,
): Promise<{
	readonly operatorGrade: ReturnType<typeof gradedLetter>;
	readonly judgeGrade: JudgeGrade;
}> {
	const stage = await requiredStage(runsDirectory, ref);
	const { criteria } = stage;
	if (
		!sameIds(grade.hardBlockers, criteria.hardBlockers) ||
		!sameIds(grade.requirements, criteria.requirements) ||
		!sameIds(grade.dimensions, criteria.dimensions)
	) {
		throw new CalibrationRefusalError(
			400,
			"Grade every rubric criterion of this stage exactly once",
		);
	}

	try {
		await writeOperatorGrade(runsDirectory, ref, grade);
	} catch (error) {
		if (!(error instanceof OperatorGradeExistsError)) {
			throw error;
		}

		throw new CalibrationRefusalError(409, error.message);
	}

	return { operatorGrade: gradedLetter(grade), judgeGrade: stage.judgeGrade };
}

function runStageRef(params: {
	readonly run: string;
	readonly stage: string;
}): GradedStageRef {
	return {
		kind: "run",
		run: confined(params.run),
		stage: confined(params.stage),
	};
}

function repStageRef(params: {
	readonly groupId: string;
	readonly repId: string;
	readonly stage: string;
}): GradedStageRef {
	return {
		kind: "rep",
		groupId: confined(params.groupId),
		repId: confined(params.repId),
		stage: confined(params.stage),
	};
}

function replayStageRef(params: {
	readonly lineage: string;
	readonly timestamp: string;
}): GradedStageRef {
	return {
		kind: "replay",
		lineage: confined(params.lineage),
		timestamp: confined(params.timestamp),
	};
}

/**
 * Chained from `new Hono()` for the RPC type, as `createApiApp` explains.
 * Each stage kind keeps the path shape the other stage routes use, so every
 * segment is one identity the reader confines.
 */
// oxlint-disable-next-line typescript/explicit-function-return-type, typescript/explicit-module-boundary-types
export const createCalibrationApp = (dependencies: CalibrationDependencies) => {
	const { runsDirectory } = dependencies;

	return new Hono()
		.get("/api/calibration", async (context) =>
			context.json(await calibrationReport(runsDirectory)),
		)
		.get("/api/calibration/runs/:run/stages/:stage", async (context) => {
			try {
				return context.json(
					await stageReview(runsDirectory, runStageRef(context.req.param())),
				);
			} catch (error) {
				if (!(error instanceof CalibrationRefusalError)) {
					throw error;
				}

				return context.json({ error: error.message }, error.status);
			}
		})
		.post("/api/calibration/runs/:run/stages/:stage/grade", async (context) => {
			try {
				return context.json(
					await recordOperatorGrade(
						runsDirectory,
						runStageRef(context.req.param()),
						operatorGradeFrom(await context.req.text()),
					),
					201,
				);
			} catch (error) {
				if (!(error instanceof CalibrationRefusalError)) {
					throw error;
				}

				return context.json({ error: error.message }, error.status);
			}
		})
		.get(
			"/api/calibration/groups/:groupId/reps/:repId/stages/:stage",
			async (context) => {
				try {
					return context.json(
						await stageReview(runsDirectory, repStageRef(context.req.param())),
					);
				} catch (error) {
					if (!(error instanceof CalibrationRefusalError)) {
						throw error;
					}

					return context.json({ error: error.message }, error.status);
				}
			},
		)
		.post(
			"/api/calibration/groups/:groupId/reps/:repId/stages/:stage/grade",
			async (context) => {
				try {
					return context.json(
						await recordOperatorGrade(
							runsDirectory,
							repStageRef(context.req.param()),
							operatorGradeFrom(await context.req.text()),
						),
						201,
					);
				} catch (error) {
					if (!(error instanceof CalibrationRefusalError)) {
						throw error;
					}

					return context.json({ error: error.message }, error.status);
				}
			},
		)
		.get("/api/calibration/replays/:lineage/:timestamp", async (context) => {
			try {
				return context.json(
					await stageReview(runsDirectory, replayStageRef(context.req.param())),
				);
			} catch (error) {
				if (!(error instanceof CalibrationRefusalError)) {
					throw error;
				}

				return context.json({ error: error.message }, error.status);
			}
		})
		.post(
			"/api/calibration/replays/:lineage/:timestamp/grade",
			async (context) => {
				try {
					return context.json(
						await recordOperatorGrade(
							runsDirectory,
							replayStageRef(context.req.param()),
							operatorGradeFrom(await context.req.text()),
						),
						201,
					);
				} catch (error) {
					if (!(error instanceof CalibrationRefusalError)) {
						throw error;
					}

					return context.json({ error: error.message }, error.status);
				}
			},
		);
};

export type CalibrationRoutes = ReturnType<typeof createCalibrationApp>;
