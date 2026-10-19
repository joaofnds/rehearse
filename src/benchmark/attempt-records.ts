import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import type { Attempt, AttemptLineageInputs } from "./attempt-contract";
import { hashedFileSchema } from "./checkpoint";
import { effortSchema } from "./config";
import type { Immutable } from "./contracts";
import { stageLetterGradeSchema } from "./contracts";
import { recordedFinalReplySchema, stageOutputWords } from "./output-words";
import { readReplayRecord } from "./replay-record";
import type { BenchmarkRunPaths } from "./run-layout";

const recordedDimensionSchema = z
	.object({ grade: stageLetterGradeSchema, id: z.string() })
	.loose();

const recordedAttemptInputSchema = z
	.object({
		artifact: z
			.object({ content: z.string(), path: z.string() })
			.loose()
			.optional(),
		changedPaths: z.array(z.string()).optional(),
		diff: z.string().optional(),
		transcript: recordedFinalReplySchema.optional(),
	})
	.loose();

const attemptScorecardSchema = z
	.object({
		corpusFiles: z.array(hashedFileSchema).optional(),
		costUsd: z.number(),
		effort: effortSchema.optional(),
		grade: z
			.object({
				dimensions: z.array(recordedDimensionSchema),
				grade: stageLetterGradeSchema,
				verdict: z.enum(["CONTINUE", "STOP"]),
			})
			.loose(),
		input: recordedAttemptInputSchema,
		model: z.string().nonempty().optional(),
		stage: z.string().nonempty(),
	})
	.loose();

type AttemptScorecard = Immutable<z.infer<typeof attemptScorecardSchema>>;

interface AttemptMeasurements {
	readonly totalCostUsd?: number | undefined;
	readonly lineageInputs?: AttemptLineageInputs | undefined;
}

function attemptFromScorecard(
	label: string,
	scorecard: AttemptScorecard,
	{ totalCostUsd, lineageInputs }: AttemptMeasurements = {},
): Attempt {
	const { artifact, changedPaths, diff, transcript } = scorecard.input;

	return {
		artifact,
		changedPaths,
		diff,
		dimensions: scorecard.grade.dimensions,
		grade: scorecard.grade.grade,
		judgeCostUsd: scorecard.costUsd,
		label,
		lineageInputs,
		totalCostUsd,
		verdict: scorecard.grade.verdict,
		words: stageOutputWords({ artifact, transcript }),
	};
}

/**
 * The original run's stage file holds its scorecard only when the stage was
 * judged; a pending or failed marker is not an attempt. The stage session's
 * own cost lives in the run artifact, not the stage file, so the original
 * attempt carries no total. Older stage files also carry no lineage inputs,
 * so the comparison guard skips those attempts rather than assuming inputs.
 */
async function loadOriginalAttempt(
	paths: BenchmarkRunPaths,
	stage: string,
): Promise<Attempt | undefined> {
	const file = Bun.file(paths.stageFile(stage));
	if (!(await file.exists())) {
		return undefined;
	}

	const parsed = attemptScorecardSchema.safeParse(
		JSON.parse(await file.text()),
	);
	if (!parsed.success) {
		return undefined;
	}

	const { corpusFiles, model, effort } = parsed.data;
	const lineageInputs =
		corpusFiles !== undefined && model !== undefined
			? { corpusFiles, effort, model }
			: undefined;

	return attemptFromScorecard(`original run ${paths.name}`, parsed.data, {
		lineageInputs,
		totalCostUsd: undefined,
	});
}

/**
 * Every attempt at one checkpoint: the original stage result, then each
 * replay in the order it was recorded. Grouping needs no search because
 * replay records live under the consumed checkpoint's lineage.
 */
async function loadAttempts(
	paths: BenchmarkRunPaths,
	stage: string,
	lineage: string,
): Promise<Attempt[]> {
	const attempts: Attempt[] = [];
	const original = await loadOriginalAttempt(paths, stage);
	if (original) {
		attempts.push(original);
	}

	const replaysDirectory = paths.replayDirectory(lineage);
	const entries = await replayRecordEntries(replaysDirectory);

	await Array.fromAsync(entries.toSorted(), async (entry) => {
		const record = await readReplayRecord(join(replaysDirectory, entry));
		attempts.push(
			attemptFromScorecard(
				`replay ${record.timestamp}`,
				attemptScorecardSchema.parse(record.scorecard),
				{
					lineageInputs: {
						corpusFiles: record.corpusFiles,
						effort: record.effort,
						model: record.model,
					},
					totalCostUsd:
						record.stageCostUsd +
						record.productOwnerCostUsd +
						record.judgeCostUsd,
				},
			),
		);
	});

	return attempts;
}
async function replayRecordEntries(
	replaysDirectory: string,
): Promise<readonly string[]> {
	let entries: string[] = [];
	try {
		const replayEntries = await readdir(replaysDirectory);
		entries = replayEntries.filter((entry) => entry.endsWith(".json"));
	} catch (error) {
		if (
			!(error instanceof Error && "code" in error && error.code === "ENOENT")
		) {
			throw error;
		}
	}

	return entries;
}

export default loadAttempts;
