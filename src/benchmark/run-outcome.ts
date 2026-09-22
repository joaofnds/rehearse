import { z } from "zod";
import { runStageFiles } from "./run-layout";

export const stoppedStageRecordSchema = z
	.object({
		status: z.literal("STAGE_JUDGE_FAILED"),
		stage: z.string().min(1),
		error: z.string().min(1),
		corpusFiles: z
			.array(z.object({ path: z.string().min(1), sha256: z.string().min(1) }))
			.optional(),
		model: z.string().min(1).optional(),
	})
	.loose();

export interface StoppedStage {
	readonly stage: string;
	readonly error: string;
}

/**
 * A stage that stops the run overwrites its own `<run>.<stage>.json` with a
 * stop record instead of a judged scorecard, so among a run's stage files at
 * most one carries `status: STAGE_JUDGE_FAILED`. A run that never stopped, or
 * that stopped before any stage wrote a file at all, has none.
 */
export async function stoppedStage(
	runsDirectory: string,
	run: string,
): Promise<StoppedStage | undefined> {
	for (const file of await runStageFiles(runsDirectory, run)) {
		const parsed = stoppedStageRecordSchema.safeParse(
			JSON.parse(await Bun.file(file).text()),
		);
		if (parsed.success) {
			return { stage: parsed.data.stage, error: parsed.data.error };
		}
	}

	return undefined;
}
