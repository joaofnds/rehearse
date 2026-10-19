import { join } from "node:path";

import { z } from "zod";

import {
	humanReviewSchema,
	judgeGradeSchema,
	stageGradeSchema,
	stageRubricSchema,
} from "./contracts";
import type { Immutable } from "./contracts";
import type {
	CalibratedStage,
	JudgeAgreementCalibration,
} from "./judge-agreement-contract";
import { benchmarkRunPaths } from "./run-layout";

const PREFIX_START_INDEX = 0;

const calibrationSchema = z.object({ humanReview: humanReviewSchema }).loose();

const calibratedStageArtifactSchema = z
	.object({
		calibration: calibrationSchema,
		grade: stageGradeSchema,
		judgeModel: z.string().nonempty().optional(),
		rubric: stageRubricSchema,
		stage: z.string().nonempty(),
	})
	.loose();

/**
 * What the agreement baseline reads out of a stage's record: the stage it
 * graded, the rubric it graded against, and the grade. Deliberately not the
 * `stageScorecardSchema` a scorecard is parsed by, which requires five more
 * fields this needs none of, so a record lacking one still yields its grade.
 */
const gradedStageSchema = calibratedStageArtifactSchema.omit({
	calibration: true,
	judgeModel: true,
});

const calibratedFinalArtifactSchema = z
	.object({
		calibration: calibrationSchema,
		grade: judgeGradeSchema,
		judgeModel: z.string().nonempty(),
		rubric: z.string().nonempty(),
		stageScorecards: z.array(gradedStageSchema),
		status: z.literal("COMPLETE"),
	})
	.loose();

const judgeManifestSchema = z
	.object({ judgeModel: z.string().nonempty() })
	.loose();

type LoadedCalibrationArtifact =
	| {
			readonly kind: "stage";
			readonly record: z.infer<typeof calibratedStageArtifactSchema>;
	  }
	| {
			readonly kind: "final";
			readonly record: z.infer<typeof calibratedFinalArtifactSchema>;
	  };

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
		? fileName.slice(PREFIX_START_INDEX, -suffix.length)
		: undefined;
}

async function historicalStageJudgeModel(
	runsDirectory: string,
	runName: string,
): Promise<string | undefined> {
	try {
		const { manifestFile } = benchmarkRunPaths(runsDirectory, runName);
		const manifestText = await Bun.file(manifestFile).text();
		const manifest = judgeManifestSchema.parse(JSON.parse(manifestText));

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
	await Array.fromAsync(entries, async (entry) => {
		if (
			!entry.isFile() ||
			!entry.name.startsWith(`${runName}.`) ||
			!entry.name.endsWith(".json")
		) {
			return;
		}

		const scorecard = await readStageScorecard(join(runsDirectory, entry.name));
		if (scorecard !== undefined) {
			scorecards.push(scorecard);
		}
	});

	return scorecards;
}

interface CalibrationDirectoryEntry {
	readonly name: string;
	readonly isFile: () => boolean;
}
interface NamedStageCalibration {
	readonly stage: Immutable<
		Extract<LoadedCalibrationArtifact, { kind: "stage" }>["record"]
	>;
	readonly fileName: string;
	readonly entries: readonly CalibrationDirectoryEntry[];
}
async function resolvedStageCalibration(
	runsDirectory: string,
	{ stage, fileName, entries }: NamedStageCalibration,
): Promise<JudgeAgreementCalibration | undefined> {
	const runName = stageRunName(fileName, stage.stage);
	if (runName === undefined) {
		return undefined;
	}

	const judgeModel =
		stage.judgeModel ??
		(await historicalStageJudgeModel(runsDirectory, runName));
	if (judgeModel === undefined) {
		return undefined;
	}

	return {
		humanReview: stage.calibration.humanReview,
		judgeModel,
		stages: await completedStageScorecards(runsDirectory, runName, entries),
	};
}

export {
	readCalibrationArtifact,
	stageRunName,
	historicalStageJudgeModel,
	completedStageScorecards,
	resolvedStageCalibration,
};
export type { CalibrationDirectoryEntry, LoadedCalibrationArtifact };
