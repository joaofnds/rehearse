import { CommandError } from "./command";
import type { Effort, WorkflowStage } from "./config";
import {
	liveCorpusSource,
	readCorpusInstructions,
	resolveCorpusFile,
} from "./corpus-file";
import type { LiveCorpusRoot } from "./corpus-file";
import type {
	CorpusSourceResolver,
	ResolvedCorpusSource,
} from "./corpus-source";
import type {
	CalibrationResult,
	ContextFile,
	HumanReview,
	JudgeGrade,
	LocalCheckResult,
	StageRubric,
	StageScorecard,
} from "./contracts";
import { humanReviewSchema } from "./contracts";
import type { JudgeResult } from "./judge";
import { runJudge, validateRubricDefinition } from "./judge";
import type { JudgeBudget } from "./judge-attempt";
import type { SpendCeiling } from "./spend-ceiling";
import { parseStageRubric, runStageJudge } from "./stage-grading";

export interface Questioner {
	readonly question: (prompt: string) => Promise<string>;
}

export interface FinalCandidate {
	readonly originalGrade: JudgeGrade;
	readonly baselineContext: readonly ContextFile[];
	readonly diff: string;
	readonly changedPaths: readonly string[];
	readonly checkIntegrity: LocalCheckResult;
	readonly localChecks: LocalCheckResult;
}

interface CalibrationContext {
	readonly rl: Questioner;
	readonly reviewFile: string;
	readonly targetDir: string;
	readonly originalInstructions: string;
	readonly originalRubric: string;
	readonly finalRubricPath: string;
	readonly rubricsDirectory: string;
	readonly finalCandidate?: FinalCandidate | undefined;
	readonly stageScorecards: readonly StageScorecard[];
	readonly judgeModel: string;
	readonly judgeEffort?: Effort | undefined;
	readonly sessionBudgetUsd: number;
	readonly spendCeiling: SpendCeiling;
	readonly stageJudge?: typeof runStageJudge | undefined;
	readonly resolveCorpus?: CorpusSourceResolver | undefined;
	readonly log: (message: string) => void;
}

export class CalibrationIncompleteError extends Error {
	public override name = "CalibrationIncompleteError";
}

async function asCalibrationInput<T>(
	operation: () => T | Promise<T>,
): Promise<T> {
	try {
		return await operation();
	} catch (error) {
		if (
			error instanceof CommandError ||
			error instanceof CalibrationIncompleteError ||
			error instanceof TypeError ||
			error instanceof ReferenceError ||
			error instanceof RangeError
		) {
			throw error;
		}

		throw new CalibrationIncompleteError(
			error instanceof Error ? error.message : String(error),
			{ cause: error },
		);
	}
}

export function parseHumanReview(review: string): HumanReview {
	try {
		return humanReviewSchema.parse(JSON.parse(review));
	} catch (error) {
		throw new CalibrationIncompleteError(
			error instanceof Error ? error.message : String(error),
			{ cause: error },
		);
	}
}

export function validateCalibration(
	review: HumanReview,
	originalGrade?: JudgeGrade,
	revisedGrade?: JudgeGrade,
	originalStageScorecards: readonly StageScorecard[] = [],
	revisedStageScorecards: readonly StageScorecard[] = [],
): void {
	const realDefects = review.findings.filter(({ judgeAssessment }) =>
		["CAUGHT", "MISSED"].includes(judgeAssessment),
	);

	if (review.verdict === "ACCEPT" && realDefects.length > 0) {
		throw new CalibrationIncompleteError(
			"Human review cannot accept a candidate with real defects",
		);
	}

	for (const finding of review.findings) {
		if (finding.judgeAssessment === "NOT_PROMOTED") {
			continue;
		}

		const rubricId = finding.rubricId ?? "";
		if (finding.stage !== "final") {
			validateStageFinding(
				finding.stage,
				finding.judgeAssessment,
				rubricId,
				originalStageScorecards,
				revisedStageScorecards,
			);
			continue;
		}

		if (!originalGrade) {
			throw new CalibrationIncompleteError(
				"Final-stage findings require a final Judge grade",
			);
		}

		const originalRequirement = originalGrade.requirements.find(
			({ id }) => id === rubricId,
		);
		const revisedRequirement = revisedGrade?.requirements.find(
			({ id }) => id === rubricId,
		);
		assertFindingMatchesGrades(
			finding.judgeAssessment,
			rubricId,
			"",
			originalRequirement && originalRequirement.status === "FAIL",
			revisedGrade !== undefined,
			revisedRequirement && revisedRequirement.status === "FAIL",
		);
	}
}

type ConfirmedAssessment = Exclude<
	HumanReview["findings"][number]["judgeAssessment"],
	"NOT_PROMOTED"
>;

function validateStageFinding(
	stage: WorkflowStage,
	assessment: ConfirmedAssessment,
	rubricId: string,
	originalScorecards: readonly StageScorecard[],
	revisedScorecards: readonly StageScorecard[],
): void {
	const original = originalScorecards.find(
		(scorecard) => scorecard.stage === stage,
	);
	if (!original) {
		throw new CalibrationIncompleteError(`No ${stage} scorecard was recorded`);
	}

	const revised = revisedScorecards.find(
		(scorecard) => scorecard.stage === stage,
	);
	assertFindingMatchesGrades(
		assessment,
		rubricId,
		`${stage} `,
		stageItemFailure(original, rubricId),
		revised !== undefined,
		revised && stageItemFailure(revised, rubricId),
	);
}

function assertFindingMatchesGrades(
	assessment: ConfirmedAssessment,
	rubricId: string,
	label: string,
	originalFailure: boolean | undefined,
	revisedAvailable: boolean,
	revisedFailure: boolean | undefined,
): void {
	if (assessment === "CAUGHT") {
		if (originalFailure !== true) {
			throw new CalibrationIncompleteError(
				`Original ${label}Judge did not catch ${rubricId}`,
			);
		}
		return;
	}

	if (!revisedAvailable) {
		throw new CalibrationIncompleteError(
			`${assessment} requires a revised grade`,
		);
	}

	if (assessment === "MISSED" && originalFailure === true) {
		throw new CalibrationIncompleteError(
			`Original ${label}Judge already caught ${rubricId}`,
		);
	}
	if (assessment === "MISSED" && revisedFailure !== true) {
		throw new CalibrationIncompleteError(
			`Revised ${label}rubric does not catch ${rubricId}`,
		);
	}
	if (
		assessment === "FALSE_POSITIVE" &&
		(originalFailure !== true || revisedFailure !== false)
	) {
		throw new CalibrationIncompleteError(
			`Revised ${label}rubric does not correct ${rubricId}`,
		);
	}
}

function stageItemFailure(
	scorecard: StageScorecard,
	rubricId: string,
): boolean | undefined {
	const blocker = scorecard.grade.hardBlockers.find(
		({ id }) => id === rubricId,
	);
	if (blocker) {
		return blocker.status === "FAIL";
	}
	const requirement = scorecard.grade.requirements.find(
		({ id }) => id === rubricId,
	);
	if (requirement) {
		return requirement.status === "FAIL";
	}
	const dimension = scorecard.grade.dimensions.find(
		({ id }) => id === rubricId,
	);
	if (dimension) {
		return ["C", "D", "F"].includes(dimension.grade);
	}

	return undefined;
}

export interface FrozenCalibrationEvidence {
	readonly instructions: string;
	readonly finalRubric: string;
	readonly finalCandidate?: FinalCandidate | undefined;
	readonly stageScorecards: readonly StageScorecard[];
}

export interface CurrentCalibrationSources {
	readonly instructions: string;
	readonly finalRubric: string;
	readonly stageRubrics: ReadonlyMap<WorkflowStage, string>;
}

export interface CalibrationJudges {
	readonly stageJudge: (
		scorecard: Readonly<StageScorecard>,
		source: {
			readonly rubricPath: string;
			readonly content: string;
			readonly rubric: StageRubric;
		},
	) => Promise<StageScorecard>;
	readonly finalJudge?:
		| ((
				rubric: string,
				candidate: Readonly<FinalCandidate>,
		  ) => Promise<JudgeResult>)
		| undefined;
	readonly log?: ((message: string) => void) | undefined;
}

interface StageRejudge {
	readonly stageRubricsChanged: readonly WorkflowStage[];
	readonly revisedStageScorecards: readonly StageScorecard[];
}

async function rejudgeStages(
	frozen: Readonly<FrozenCalibrationEvidence>,
	current: Readonly<CurrentCalibrationSources>,
	judges: Readonly<CalibrationJudges>,
	log: (message: string) => void,
): Promise<StageRejudge> {
	const revisedStageScorecards: StageScorecard[] = [];
	const stageRubricsChanged: WorkflowStage[] = [];

	for (const scorecard of frozen.stageScorecards) {
		const content = current.stageRubrics.get(scorecard.stage);
		if (content === undefined) {
			continue;
		}

		const updatedStageRubric = await asCalibrationInput(() =>
			parseStageRubric(content, scorecard.input.kind),
		);
		if (
			JSON.stringify(updatedStageRubric) === JSON.stringify(scorecard.rubric)
		) {
			continue;
		}

		stageRubricsChanged.push(scorecard.stage);
		log(`\nRejudging the same ${scorecard.stage} stage`);
		const revisedScorecard = await asCalibrationInput(() =>
			judges.stageJudge(scorecard, {
				rubricPath: scorecard.rubricPath,
				content,
				rubric: updatedStageRubric,
			}),
		);
		revisedStageScorecards.push(revisedScorecard);
		log(JSON.stringify(revisedScorecard.grade, null, 2));
	}

	return { stageRubricsChanged, revisedStageScorecards };
}

interface FinalRejudge {
	readonly revisedRubricIds?: readonly string[] | undefined;
	readonly revisedJudgePrompt?: string | undefined;
	readonly revisedGrade?: JudgeGrade | undefined;
}

async function rejudgeFinal(
	frozen: Readonly<FrozenCalibrationEvidence>,
	updatedRubric: string,
	judges: Readonly<CalibrationJudges>,
	log: (message: string) => void,
): Promise<FinalRejudge> {
	const { finalCandidate: candidate } = frozen;
	const { finalJudge } = judges;
	if (candidate === undefined || finalJudge === undefined) {
		return {};
	}

	const revisedRubricIds = await asCalibrationInput(() =>
		validateRubricDefinition(updatedRubric),
	);
	log("\nRejudging the same candidate with the revised rubric");
	const revised = await asCalibrationInput(() =>
		finalJudge(updatedRubric, candidate),
	);
	log(JSON.stringify(revised.grade, null, 2));

	return {
		revisedRubricIds,
		revisedJudgePrompt: revised.prompt,
		revisedGrade: revised.grade,
	};
}

/**
 * Which file holds a stage's current rubric: the path its scorecard recorded,
 * never one recomputed from the case. An edit lands in the file the run graded
 * from, so that is the file a rejudge reads back, and this is the one place
 * that is stated. A rubric neither caller can read is a refusal, phrased for
 * the caller: the interactive loop re-prompts, the command exits.
 */
export async function readStageRubrics(
	stageScorecards: readonly Readonly<StageScorecard>[],
	readText: (path: string) => Promise<string>,
): Promise<ReadonlyMap<WorkflowStage, string>> {
	const stageRubrics = new Map<WorkflowStage, string>();
	for (const scorecard of stageScorecards) {
		stageRubrics.set(scorecard.stage, await readText(scorecard.rubricPath));
	}

	return stageRubrics;
}

/**
 * The judgment a calibration is, as a value: no prompt, no file read, no
 * clock. The interactive loop and the `calibrate` command differ in where the
 * text and the confirmation come from, never in what the two of them decide.
 * `confirmRejudge` is asked only when the rejudge produced a revised result,
 * which is where the interactive flow asks for its typed yes.
 */
export async function calibrate(
	frozen: Readonly<FrozenCalibrationEvidence>,
	current: Readonly<CurrentCalibrationSources>,
	review: Readonly<HumanReview>,
	judges: Readonly<CalibrationJudges>,
	confirmRejudge: () => Promise<boolean> = () => Promise.resolve(true),
): Promise<CalibrationResult> {
	const log = judges.log ?? (() => undefined);
	const instructionsChanged = current.instructions !== frozen.instructions;
	const rubricChanged = current.finalRubric !== frozen.finalRubric;
	const { stageRubricsChanged, revisedStageScorecards } = await rejudgeStages(
		frozen,
		current,
		judges,
		log,
	);
	const { revisedRubricIds, revisedJudgePrompt, revisedGrade } = rubricChanged
		? await rejudgeFinal(frozen, current.finalRubric, judges, log)
		: {};

	validateCalibration(
		review,
		frozen.finalCandidate?.originalGrade,
		revisedGrade,
		frozen.stageScorecards,
		revisedStageScorecards,
	);
	const rejudged =
		revisedGrade !== undefined || revisedStageScorecards.length > 0;
	if (rejudged && !(await confirmRejudge())) {
		throw new CalibrationIncompleteError(
			"Revised Judge result was not confirmed",
		);
	}

	return {
		humanReview: review,
		instructionsChanged,
		updatedInstructions: instructionsChanged ? current.instructions : undefined,
		rubricChanged,
		updatedRubric: rubricChanged ? current.finalRubric : undefined,
		revisedRubricIds,
		revisedJudgePrompt,
		revisedGrade,
		rejudgeConfirmedByHuman: rejudged ? true : undefined,
		stageRubricsChanged,
		revisedStageScorecards:
			revisedStageScorecards.length > 0 ? revisedStageScorecards : undefined,
	};
}

async function writeHumanReviewTemplate(path: string): Promise<void> {
	await Bun.write(
		path,
		`${JSON.stringify(
			{
				verdict: "REPLACE_WITH_ACCEPT_OR_REJECT",
				summary: "",
				findings: [],
			},
			null,
			2,
		)}\n`,
	);
}

/**
 * A pipeline run measures only the live install, whatever corpus is linked
 * while it waits for review, so its calibration compares and edits that.
 */
function measuredCorpus(): Promise<LiveCorpusRoot> {
	return Promise.resolve(liveCorpusSource());
}

/**
 * The interactive loop around the judgment: it prompts, reads the four
 * sources from disk, and asks for the typed confirmation, then hands values
 * to `calibrate`. Every rejection is caught here and re-prompted, which is
 * what makes the flawed candidate the fixture for the new rule.
 */
export async function collectCalibration(
	context: CalibrationContext,
): Promise<CalibrationResult> {
	await writeHumanReviewTemplate(context.reviewFile);
	const source = await (context.resolveCorpus ?? measuredCorpus)(undefined);
	const instructionsPath = resolveCorpusFile(source, "CLAUDE.md");
	const editTargets = context.finalCandidate
		? `${instructionsPath}, ${context.finalRubricPath}, and/or the relevant file under ${context.rubricsDirectory}`
		: `${instructionsPath} and/or the relevant file under ${context.rubricsDirectory}`;
	const frozen: FrozenCalibrationEvidence = {
		instructions: context.originalInstructions,
		finalRubric: context.originalRubric,
		finalCandidate: context.finalCandidate,
		stageScorecards: context.stageScorecards,
	};
	const judges = calibrationJudges(context);

	while (true) {
		await context.rl.question(
			`Review the completed stages in ${context.targetDir}. Record every finding with its stage in ${context.reviewFile}. Update ${editTargets} where justified, then press Enter to validate the calibration.`,
		);

		try {
			const humanReview = parseHumanReview(
				await asCalibrationInput(() => Bun.file(context.reviewFile).text()),
			);
			const current = await readCurrentSources(context, source);

			return await calibrate(frozen, current, humanReview, judges, () =>
				askRejudgeConfirmation(context.rl),
			);
		} catch (error) {
			if (!(error instanceof CalibrationIncompleteError)) {
				throw error;
			}

			console.error(`Calibration incomplete: ${error.message}`);
		}
	}
}

function judgeBudgetOf(context: Readonly<CalibrationContext>): JudgeBudget {
	return {
		sessionBudgetUsd: context.sessionBudgetUsd,
		spendCeiling: context.spendCeiling,
	};
}

function calibrationJudges(
	context: Readonly<CalibrationContext>,
): CalibrationJudges {
	return {
		stageJudge: (scorecard, source) =>
			(context.stageJudge ?? runStageJudge)(
				context.judgeModel,
				context.judgeEffort,
				judgeBudgetOf(context),
				scorecard.input,
				source,
			),
		finalJudge: (rubric, candidate) =>
			runJudge(
				context.judgeModel,
				context.judgeEffort,
				judgeBudgetOf(context),
				rubric,
				candidate.baselineContext,
				candidate.diff,
				candidate.changedPaths,
				candidate.checkIntegrity,
				candidate.localChecks,
			),
		log: context.log,
	};
}

async function readCurrentSources(
	context: Readonly<CalibrationContext>,
	source: ResolvedCorpusSource,
): Promise<CurrentCalibrationSources> {
	const [instructions, finalRubric] = await asCalibrationInput(() =>
		Promise.all([
			readCorpusInstructions(source),
			Bun.file(context.finalRubricPath).text(),
		]),
	);
	const stageRubrics = await readStageRubrics(context.stageScorecards, (path) =>
		asCalibrationInput(() => Bun.file(path).text()),
	);

	return { instructions, finalRubric, stageRubrics };
}

async function askRejudgeConfirmation(rl: Questioner): Promise<boolean> {
	const confirmation = await rl.question(
		"Confirm that the revised Judge result catches or corrects each finding for the right reason. Type yes to finalize, or anything else to revise the rubric: ",
	);

	return confirmation.trim().toLowerCase() === "yes";
}
