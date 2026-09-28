import { readdir } from "node:fs/promises";
import type { z } from "zod";
import {
	calibrate,
	CalibrationIncompleteError,
	readStageRubrics,
} from "#benchmark/calibration";
import type {
	CalibrationJudges,
	CurrentCalibrationSources,
	FrozenCalibrationEvidence,
} from "#benchmark/calibration";
import type {
	CalibratableArtifact,
	CalibratableStageRecord,
} from "#benchmark/calibration-record";
import {
	calibratableArtifactSchema,
	calibratableStageRecordSchema,
} from "#benchmark/calibration-record";
import { caseRelative, readCaseDeclaration } from "#benchmark/case";
import { displayPath } from "#benchmark/config";
import { liveCorpusInstructions } from "#benchmark/corpus-file";
import type { Effort } from "#benchmark/config";
import type {
	CalibrationResult,
	HumanReview,
	StageScorecard,
} from "#benchmark/contracts";
import { humanReviewSchema } from "#benchmark/contracts";
import type { JudgeAgreementCalibration } from "#benchmark/judge-agreement";
import type { JudgeBudget } from "#benchmark/judge-attempt";
import { loadJudgeAgreementReport } from "#benchmark/judge-agreement";
import { runJudge } from "#benchmark/judge";
import type { SpendCeiling } from "#benchmark/spend-ceiling";
import { createSpendCeiling } from "#benchmark/spend-ceiling";
import { runStageJudge } from "#benchmark/stage-grading";
import { completeRunArtifact } from "#benchmark/run";
import { benchmarkRunPaths } from "#benchmark/run-layout";
import { UsageError } from "#cli/commands";
import { RefusedPreconditionError } from "#cli/interactive-stdin";
import type { CommandOutput } from "#cli/output";
import { writeRecord } from "#cli/output";
import { parseRunRecordId } from "#cli/record-id";

export interface CurrentControlSources {
	readonly instructions: string;
	readonly finalRubric: string;
}

export interface CalibrateRequest {
	readonly id: string | undefined;
	readonly runsDirectory: string;
	readonly json: boolean;
	readonly confirmRejudge: boolean;
	readonly readCurrentSources?:
		| ((caseId: string | undefined) => Promise<CurrentControlSources>)
		| undefined;
}

/**
 * The two records a run may leave for calibration: the artifact a graded run
 * writes, and the stage file a run stopped at a stage writes. The command
 * reads what is on disk rather than taking a flag naming which case it is in,
 * because the run already decided that and a second answer could disagree.
 */
type CalibratableRecord =
	| {
			readonly kind: "final";
			readonly file: string;
			readonly record: CalibratableArtifact;
	  }
	| {
			readonly kind: "stage";
			readonly file: string;
			readonly record: CalibratableStageRecord;
	  };

async function loadRecord(
	runsDirectory: string,
	run: string,
): Promise<CalibratableRecord> {
	const paths = benchmarkRunPaths(runsDirectory, run);
	if (await Bun.file(paths.artifactFile).exists()) {
		const parsed = await readRecord(
			paths.artifactFile,
			calibratableArtifactSchema,
		);
		if (!parsed.success) {
			throw new UsageError(parsed.error.message);
		}

		const record = parsed.data;
		if (record.status !== "AWAITING_HUMAN_REVIEW") {
			throw new RefusedPreconditionError(
				`Run ${run} is ${record.status}; only a run awaiting human review is calibrated`,
			);
		}

		return { kind: "final", file: paths.artifactFile, record };
	}

	return loadStoppedStage(runsDirectory, run);
}

/**
 * A stopped run's stage file is named for the stage it stopped at, which the
 * command does not know until it looks. Exactly one stage may stop, so the one
 * record carrying a STOP verdict and no calibration is the one to complete.
 */
async function loadStoppedStage(
	runsDirectory: string,
	run: string,
): Promise<CalibratableRecord> {
	const paths = benchmarkRunPaths(runsDirectory, run);
	for (const stage of await stageNamesOf(runsDirectory, run)) {
		const file = paths.stageFile(stage);
		const parsed = await readRecord(file, calibratableStageRecordSchema);
		if (
			parsed.success &&
			parsed.data.grade.verdict === "STOP" &&
			parsed.data.calibration === undefined
		) {
			return { kind: "stage", file, record: parsed.data };
		}
	}

	throw new RefusedPreconditionError(
		`No run ${run} awaiting calibration at ${displayPath(paths.artifactFile)}`,
	);
}

const STAGE_FILE_SUFFIX = ".json";

async function stageNamesOf(
	runsDirectory: string,
	run: string,
): Promise<readonly string[]> {
	const entries = await readdir(runsDirectory).catch(() => []);

	return entries
		.filter(
			(entry) =>
				entry.startsWith(`${run}.`) && entry.endsWith(STAGE_FILE_SUFFIX),
		)
		.map((entry) => entry.slice(run.length + 1, -STAGE_FILE_SUFFIX.length))
		.filter((stage) => stage !== "" && stage !== "review")
		.toSorted((left, right) => (left < right ? -1 : 1));
}

async function readReview(reviewFile: string): Promise<HumanReview> {
	if (!(await Bun.file(reviewFile).exists())) {
		throw new RefusedPreconditionError(
			`No review for this run at ${displayPath(reviewFile)}; record one with rehearse review first`,
		);
	}

	const parsed = await readRecord(reviewFile, humanReviewSchema);
	if (!parsed.success) {
		throw new UsageError(parsed.error.message);
	}

	return parsed.data;
}

/**
 * Every record this command reads is a file someone may have hand-edited, and
 * the review file is one `--pause` invites a reviewer to edit. A bare parser
 * message names neither the file nor the command's own boundary, so a trailing
 * comma arrived as an execution failure with nothing to act on. Reading and
 * parsing are one step, so no caller holds the untyped value in between.
 */
async function readRecord<Schema extends z.ZodType>(
	file: string,
	schema: Schema,
): Promise<z.ZodSafeParseResult<z.infer<Schema>>> {
	const text = await Bun.file(file).text();
	try {
		return schema.safeParse(JSON.parse(text));
	} catch (error) {
		throw new UsageError(
			`${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

function frozenEvidence(
	record: Readonly<CalibratableRecord>,
): FrozenCalibrationEvidence {
	if (record.kind === "stage") {
		const { record: stage } = record;

		return {
			instructions: stage.input.instructions,
			finalRubric: "",
			stageScorecards: [asScorecard(stage)],
		};
	}

	const { record: artifact } = record;

	return {
		instructions: artifact.instructions,
		finalRubric: artifact.rubric,
		finalCandidate: {
			originalGrade: artifact.grade,
			baselineContext: artifact.baselineContext,
			diff: artifact.diff,
			changedPaths: artifact.changedPaths,
			checkIntegrity: artifact.checkIntegrity,
			localChecks: artifact.localChecks,
		},
		stageScorecards: artifact.stageScorecards,
	};
}

function asScorecard(stage: Readonly<CalibratableStageRecord>): StageScorecard {
	return {
		stage: stage.stage,
		rubricPath: stage.rubricPath,
		rubric: stage.rubric,
		input: stage.input,
		prompt: stage.prompt,
		attempts: stage.attempts,
		costUsd: stage.costUsd,
		grade: stage.grade,
	};
}

/**
 * The rubric text a stage is rejudged against is read from the path the
 * scorecard recorded, not one recomputed from the case: an edit lands in the
 * file the run graded from, and that is the file this reads back.
 *
 * A rubric the command cannot read is refused, for the same reason an
 * unreadable case is: reading it as absent means the stage is not rejudged,
 * which the record then states as a rubric that did not change. The paused
 * loop re-prompts on the same read, so anything else would leave the two
 * paths disagreeing about a recorded result.
 */
async function currentSources(
	request: Readonly<CalibrateRequest>,
	frozen: Readonly<FrozenCalibrationEvidence>,
	caseId: string | undefined,
): Promise<CurrentCalibrationSources> {
	const read =
		request.readCurrentSources ??
		((id: string | undefined) => readControlSources(id, frozen.finalRubric));
	const { instructions, finalRubric } = await read(caseId);
	const stageRubrics = await readStageRubrics(
		frozen.stageScorecards,
		readStageRubricText,
	);

	return { instructions, finalRubric, stageRubrics };
}

async function readStageRubricText(path: string): Promise<string> {
	try {
		return await Bun.file(path).text();
	} catch (error) {
		throw new RefusedPreconditionError(
			`Cannot read the stage rubric this run graded against at ${path}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * The final rubric a run is rejudged against is the one its case declares, read
 * through the case id the artifact recorded. Only the declaration is read, not
 * the loaded case: calibration touches no target repository, and a case whose
 * target has moved must still calibrate. A run that recorded no case is
 * rejudged against the rubric it froze, because there is no other rubric to
 * compare it with.
 *
 * A case the artifact names but the reader cannot read is refused. Answering
 * it with the frozen rubric reads as "the rubric did not change", which
 * discards the reviewer's edit, skips the final rejudge, and records the run
 * COMPLETE, all at exit 0 and with nothing said.
 */
export async function readControlSources(
	caseId: string | undefined,
	frozenRubric: string,
): Promise<CurrentControlSources> {
	const instructions = await liveCorpusInstructions();
	if (caseId === undefined) {
		return { instructions, finalRubric: frozenRubric };
	}

	return { instructions, finalRubric: await readCaseFinalRubric(caseId) };
}

async function readCaseFinalRubric(caseId: string): Promise<string> {
	const declaration = await refusing(caseId, () => readCaseDeclaration(caseId));
	if (declaration.kind !== "pipeline") {
		throw new RefusedPreconditionError(
			`Cannot compare case ${caseId} with the rubric this run froze: it declares no final rubric`,
		);
	}

	return refusing(caseId, () =>
		Bun.file(caseRelative(declaration, declaration.finalRubric)).text(),
	);
}

async function refusing<T>(caseId: string, read: () => Promise<T>): Promise<T> {
	try {
		return await read();
	} catch (error) {
		throw new RefusedPreconditionError(
			`Cannot compare case ${caseId} with the rubric this run froze: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

function rejudged(calibration: Readonly<CalibrationResult>): boolean {
	return (
		calibration.revisedGrade !== undefined ||
		(calibration.revisedStageScorecards?.length ?? 0) > 0
	);
}

function revisedGrades(calibration: Readonly<CalibrationResult>): string {
	return JSON.stringify(
		{
			revisedGrade: calibration.revisedGrade,
			revisedStageGrades: calibration.revisedStageScorecards?.map(
				({ stage, grade }) => ({ stage, grade }),
			),
		},
		null,
		2,
	);
}

export interface JudgeKnobs {
	readonly judgeModel: string;
	readonly judgeEffort?: Effort | undefined;
	readonly sessionBudgetUsd?: number | undefined;
}

export interface CalibrateJudges {
	readonly stageJudge: CalibrationJudges["stageJudge"];
	readonly finalJudge: NonNullable<CalibrationJudges["finalJudge"]>;
}

/**
 * A rejudge runs under the model, effort, and budget the original Judge ran
 * under, which the record carries. The agreement baseline is keyed on the exact
 * Judge model, so a rejudge under a different one would start a new baseline
 * instead of adding to the run's, and running at the provider's default effort
 * rather than the recorded one would compare two Judges rather than two
 * rubrics.
 *
 * A record written before the budget was recorded has none, so the rejudge it
 * would need is refused rather than run at a limit nobody set.
 */
export function judgesFor(
	knobs: Readonly<JudgeKnobs>,
	spendCeiling: SpendCeiling,
): CalibrateJudges {
	const budget = (): JudgeBudget => {
		if (knobs.sessionBudgetUsd === undefined) {
			throw new RefusedPreconditionError(
				"This run recorded no session budget, so its evidence cannot be rejudged under the limit it ran with; calibrate it against the rubrics it froze",
			);
		}

		return { sessionBudgetUsd: knobs.sessionBudgetUsd, spendCeiling };
	};

	return {
		stageJudge: (scorecard, source) =>
			runStageJudge(
				knobs.judgeModel,
				knobs.judgeEffort,
				budget(),
				scorecard.input,
				source,
			),
		finalJudge: (rubric, candidate) =>
			runJudge(
				knobs.judgeModel,
				knobs.judgeEffort,
				budget(),
				rubric,
				candidate.baselineContext,
				candidate.diff,
				candidate.changedPaths,
				candidate.checkIntegrity,
				candidate.localChecks,
			),
	};
}

/**
 * The knobs the rejudge runs under, taken off whichever record the run left.
 * Passed as themselves rather than as the record they came from, so a field
 * the record happens to share a name with cannot reach the Judge.
 */
function judgeKnobsOf(record: Readonly<CalibratableRecord>): JudgeKnobs {
	return {
		judgeModel: record.record.judgeModel,
		judgeEffort: record.record.judgeEffort,
		sessionBudgetUsd: record.record.sessionBudgetUsd,
	};
}

/**
 * The `calibrate` command: it rejudges the frozen evidence with the rubrics and
 * instructions as they stand now, validates the findings, and records the
 * result. It asks nothing. `--confirm-rejudge` stands in for the typed yes the
 * paused loop asks for, and is required exactly where that question was asked:
 * when a rejudge produced a revised result the caller has not seen.
 *
 * Each invocation pays for its own rejudge, so confirming one costs the Judge
 * calls twice. That is the price of the two-invocation protocol rather than an
 * oversight: the rubrics and instructions are read fresh each time, and a
 * grade cached from the first invocation would let the caller confirm a result
 * the current corpus no longer produces, which is what the confirmation
 * exists to prevent. A cache would have to be invalidated on exactly the
 * inputs the rejudge already reads, so it would buy nothing a third read
 * does not.
 */
export interface CalibrateDependencies {
	readonly output: CommandOutput;
	readonly buildJudges: (
		knobs: Readonly<JudgeKnobs>,
		spendCeiling: SpendCeiling,
	) => CalibrateJudges;
	readonly probeModel: (model: string) => Promise<void>;
	readonly requireSpendCeiling: (recordsDirectory: string) => Promise<number>;
}

export async function runCalibrate(
	request: Readonly<CalibrateRequest>,
	dependencies: Readonly<CalibrateDependencies>,
): Promise<void> {
	const { buildJudges, output, probeModel, requireSpendCeiling } = dependencies;
	if (request.id === undefined) {
		throw new UsageError("Provide the run: rehearse calibrate <run:name|name>");
	}

	const { run } = parseRunRecordId(request.id);
	const record = await loadRecord(request.runsDirectory, run);
	const paths = benchmarkRunPaths(request.runsDirectory, run);
	const review = await readReview(paths.reviewFile);
	const frozen = frozenEvidence(record);
	const current = await currentSources(request, frozen, recordedCaseId(record));

	const knobs = judgeKnobsOf(record);
	const spendCeiling = createSpendCeiling({
		ceilingUsd: await requireSpendCeiling(request.runsDirectory),
	});
	await probeModel(knobs.judgeModel);
	const judges = buildJudges(knobs, spendCeiling);
	const calibration = await reportIncomplete(output, () =>
		calibrate(frozen, current, review, {
			stageJudge: judges.stageJudge,
			finalJudge: judges.finalJudge,
		}),
	);
	if (rejudged(calibration) && !request.confirmRejudge) {
		output.stderr(`${revisedGrades(calibration)}\n`);

		throw new RefusedPreconditionError(
			`The rejudge revised the grades above; re-run with --confirm-rejudge to record them for run ${run}. That rejudge runs again, against the rubrics as they stand then.`,
		);
	}

	const judgeAgreement = await loadJudgeAgreementReport(request.runsDirectory, [
		agreementInput(record, calibration),
	]);
	const completed =
		record.kind === "final"
			? completeRunArtifact(record.record, calibration, judgeAgreement)
			: { ...record.record, calibration, judgeAgreement };
	await Bun.write(record.file, `${JSON.stringify(completed, null, 2)}\n`);

	await writeRecord(output, record.file, request.json);
}

function recordedCaseId(
	record: Readonly<CalibratableRecord>,
): string | undefined {
	return record.kind === "final" ? record.record.caseId : undefined;
}

function agreementInput(
	record: Readonly<CalibratableRecord>,
	calibration: Readonly<CalibrationResult>,
): JudgeAgreementCalibration {
	if (record.kind === "stage") {
		return {
			judgeModel: record.record.judgeModel,
			humanReview: calibration.humanReview,
			stages: [asScorecard(record.record)],
		};
	}

	return {
		judgeModel: record.record.judgeModel,
		humanReview: calibration.humanReview,
		stages: record.record.stageScorecards,
		final: { rubric: record.record.rubric, grade: record.record.grade },
	};
}

/**
 * A calibration that does not hold is the caller's answer, not a stack trace:
 * the message says which finding the evidence contradicts, and the artifact
 * stays where it was so the next review can correct it.
 */
async function reportIncomplete(
	output: CommandOutput,
	work: () => Promise<CalibrationResult>,
): Promise<CalibrationResult> {
	try {
		return await work();
	} catch (error) {
		if (error instanceof CalibrationIncompleteError) {
			output.stderr(`Calibration incomplete: ${error.message}\n`);
		}

		throw error;
	}
}
