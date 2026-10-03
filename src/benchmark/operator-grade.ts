import { link, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { Immutable } from "./contracts";
import { stageLetterGradeSchema, unhandled } from "./contracts";
import { operatorGradesDirectory, runNameFromTimestamp } from "./run-layout";
import { deriveStageLetter } from "./stage-grading";
import type { StageLetterGrade } from "./stage-letter-grades";
import { STAGE_LETTER_GRADES } from "./stage-letter-grades";

/**
 * A stage the Judge graded, named by where its record sits: a pipeline run's
 * stage, a confirmation rep's stage, or a replay's scorecard.
 */
export type GradedStageRef =
	| { readonly kind: "run"; readonly run: string; readonly stage: string }
	| {
			readonly kind: "rep";
			readonly groupId: string;
			readonly repId: string;
			readonly stage: string;
	  }
	| {
			readonly kind: "replay";
			readonly lineage: string;
			readonly timestamp: string;
	  };

const passFailSchema = z.enum(["PASS", "FAIL"]);

/** What the operator submits: every rubric criterion, graded as the Judge grades it. */
export const operatorGradeSchema = z.strictObject({
	hardBlockers: z
		.array(z.strictObject({ id: z.string().min(1), status: passFailSchema }))
		.readonly(),
	requirements: z
		.array(z.strictObject({ id: z.string().min(1), status: passFailSchema }))
		.readonly(),
	dimensions: z
		.array(
			z.strictObject({ id: z.string().min(1), grade: stageLetterGradeSchema }),
		)
		.readonly(),
	note: z.string().optional(),
});

export type OperatorGrade = Immutable<z.infer<typeof operatorGradeSchema>>;

const operatorGradeRecordSchema = operatorGradeSchema.extend({
	schemaVersion: z.literal(1),
});

export class OperatorGradeExistsError extends Error {
	public override name = "OperatorGradeExistsError";
}

export function operatorGradeFile(
	runsDirectory: string,
	ref: GradedStageRef,
): string {
	const directory = operatorGradesDirectory(runsDirectory);
	switch (ref.kind) {
		case "run": {
			return join(directory, "run", ref.run, `${ref.stage}.json`);
		}
		case "rep": {
			return join(
				directory,
				"rep",
				ref.groupId,
				ref.repId,
				`${ref.stage}.json`,
			);
		}
		case "replay": {
			return join(
				directory,
				"replay",
				ref.lineage,
				`${runNameFromTimestamp(ref.timestamp)}.json`,
			);
		}
		default: {
			return unhandled(ref, "graded stage kind");
		}
	}
}

/**
 * Created exclusively: a second grade for a stage is given after the Judge's
 * grade was shown, so it is no longer blind, and two tabs cannot both write
 * one. The grade is written whole beside its place and then linked into it,
 * so an interrupted write leaves no partial grade that would refuse every
 * later one.
 */
export async function writeOperatorGrade(
	runsDirectory: string,
	ref: GradedStageRef,
	grade: OperatorGrade,
): Promise<void> {
	const file = operatorGradeFile(runsDirectory, ref);
	const written = `${file}.${crypto.randomUUID()}.partial`;
	await mkdir(dirname(file), { recursive: true });
	await writeFile(
		written,
		`${JSON.stringify({ schemaVersion: 1, ...grade }, null, 2)}\n`,
		{ flag: "wx" },
	);

	try {
		await link(written, file);
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "EEXIST") {
			throw new OperatorGradeExistsError(
				"The operator already graded this stage",
			);
		}

		throw error;
	} finally {
		await rm(written, { force: true });
	}
}

export async function readOperatorGrade(
	runsDirectory: string,
	ref: GradedStageRef,
): Promise<OperatorGrade | undefined> {
	const file = Bun.file(operatorGradeFile(runsDirectory, ref));
	if (!(await file.exists())) {
		return undefined;
	}

	const { schemaVersion: _schemaVersion, ...grade } =
		operatorGradeRecordSchema.parse(await file.json());

	return grade;
}

/** The operator's stage letter, by the rule the Judge's letter is derived by. */
export function operatorStageLetter(grade: OperatorGrade): StageLetterGrade {
	return deriveStageLetter(grade);
}

function place(letter: StageLetterGrade): number {
	return STAGE_LETTER_GRADES.indexOf(letter);
}

/** How many letter steps separate two letters for the same stage. */
export function stepsApart(
	judge: StageLetterGrade,
	operator: StageLetterGrade,
): number {
	return Math.abs(place(operator) - place(judge));
}

/** The operator's letter place minus the Judge's: positive when the Judge was more generous. */
export function driftSteps(
	judge: StageLetterGrade,
	operator: StageLetterGrade,
): number {
	return place(operator) - place(judge);
}
