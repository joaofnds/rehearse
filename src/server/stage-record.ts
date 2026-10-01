import { z } from "zod";
import type { RunManifest } from "#benchmark/manifest";
import {
	recordedStageEvidenceSchema,
	stageLetterGradeSchema,
} from "#benchmark/contracts";
import { checkpointsEntryForRun } from "#benchmark/run-layout";
import {
	canonicalRunsRoot,
	parseIdentity,
	readVerifiedFile,
	runManifest,
	SessionHistoryReaderError,
	verifiedDirectory,
	verifiedFile,
} from "./session-history-reader";

/** A stage of a recorded run, its names checked and its pipeline holding it. */
export interface StageOfRun {
	readonly runsRoot: string;
	readonly checkpointsDirectory: string;
	readonly manifest: RunManifest;
	readonly run: string;
	readonly stage: string;
}

export async function verifiedStageOfRun(request: {
	readonly runsDirectory: string;
	readonly run: string;
	readonly stage: string;
}): Promise<StageOfRun> {
	const run = parseIdentity(request.run);
	const stage = parseIdentity(request.stage);
	const runsRoot = await canonicalRunsRoot(request.runsDirectory);
	const checkpointsDirectory = await verifiedDirectory(runsRoot, [
		checkpointsEntryForRun(run),
	]);
	const manifest = await runManifest(runsRoot, checkpointsDirectory);
	if (!manifest.pipeline.stages.some(({ name }) => name === stage)) {
		throw new SessionHistoryReaderError(
			"not-found",
			"The run's pipeline has no such stage",
		);
	}

	return { runsRoot, checkpointsDirectory, manifest, run, stage };
}

const passFailItemSchema = z.looseObject({
	id: z.string(),
	status: z.enum(["PASS", "FAIL"]),
	evidence: z.array(recordedStageEvidenceSchema).readonly(),
});

const judgedGradeSchema = z.looseObject({
	hardBlockers: z.array(passFailItemSchema).readonly(),
	requirements: z.array(passFailItemSchema).readonly(),
	dimensions: z
		.array(
			z.looseObject({
				id: z.string(),
				grade: stageLetterGradeSchema,
				evidence: z.array(recordedStageEvidenceSchema).readonly(),
			}),
		)
		.readonly(),
});

export type JudgedGrade = z.infer<typeof judgedGradeSchema>;

/**
 * Where a stage's record rests. The harness writes an awaiting record before
 * its judge starts and overwrites it once judging ends, with the grade, with
 * the judged items of the stage that stopped the run, or with a stop the judge
 * never graded.
 */
export type StageRecord =
	| { readonly state: "absent" }
	| { readonly state: "awaiting-judgment" }
	| { readonly state: "judged"; readonly grade: JudgedGrade }
	| { readonly state: "not-judged" };

/** The record of the stage that stopped the run keeps its judged items beside its grade letter. */
const stopRecordSchema = judgedGradeSchema
	.extend({ status: z.literal("STAGE_JUDGE_FAILED") })
	.transform((grade): StageRecord => ({ state: "judged", grade }));

const stageRecordSchema = z.union([
	stopRecordSchema,
	z
		.looseObject({ status: z.literal("AWAITING_STAGE_JUDGE") })
		.transform((): StageRecord => ({ state: "awaiting-judgment" })),
	z
		.looseObject({ grade: judgedGradeSchema.optional() })
		.transform(({ grade }): StageRecord =>
			grade === undefined
				? { state: "not-judged" }
				: { state: "judged", grade },
		),
]);

export async function readStageRecord(
	stageOfRun: StageOfRun,
): Promise<StageRecord> {
	const { runsRoot, run, stage } = stageOfRun;
	const recordFile = await verifiedFile(
		runsRoot,
		runsRoot,
		`${run}.${stage}.json`,
		false,
	);
	if (recordFile === undefined) {
		return { state: "absent" };
	}

	return stageRecordSchema.parse(
		JSON.parse(await readVerifiedFile(runsRoot, recordFile)),
	);
}
