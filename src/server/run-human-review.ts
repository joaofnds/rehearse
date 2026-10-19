import { humanReviewSchema } from "#benchmark/contracts";
import type { HumanReview } from "#benchmark/contracts";
import type { CorpusRoot } from "#benchmark/corpus-file";
import { benchmarkRunPaths } from "#benchmark/run-layout";
import type { RunLocation } from "#benchmark/run-layout";
import { judgedStageReads } from "#benchmark/staleness-report";
import type { JudgedReadEntry } from "#benchmark/staleness-report";
import { redactAbsolutePaths } from "#server/redact-path";
import type { Reading, RunRecordStage } from "#server/run-record-contract";
import { readCheckpoint, readStageFile } from "#server/run-stage-file";

/**
 * A stage that saved no checkpoint keeps its reads on its stage record, so
 * they are judged from there, and left unjudged where the corpus under test
 * cannot judge them.
 */
async function stoppedStageReads(
	{ runsDirectory, run }: RunLocation,
	stage: string,
	source: CorpusRoot,
): Promise<
	Reading<{ readonly entries: readonly JudgedReadEntry[] }> | undefined
> {
	const paths = benchmarkRunPaths(runsDirectory, run);
	const file = await readStageFile(paths, stage);
	if (
		file?.readManifest === undefined ||
		(await readCheckpoint(paths, stage)) !== undefined
	) {
		return undefined;
	}

	try {
		const entries = await judgedStageReads(
			{ run, runsDirectory, stage },
			{ corpusFiles: file.corpusFiles ?? [], readManifest: file.readManifest },
			source,
		);

		return { entries, state: "available" };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		return { reasons: [redactAbsolutePaths(message)], state: "unavailable" };
	}
}

function withJudgedReadManifest(
	stage: RunRecordStage,
	judged: RunRecordStage["readManifest"] | undefined,
): RunRecordStage {
	if (stage.readManifest.state === "unavailable" || judged === undefined) {
		return stage;
	}

	if (judged.state === "unavailable") {
		return { ...stage, readManifestJudgment: judged };
	}

	return { ...stage, readManifest: judged };
}

/** Read the saved review without making a corrupt record look absent. */
async function readHumanReview(
	runsDirectory: string,
	run: string,
): Promise<Reading<{ readonly review: HumanReview }>> {
	const file = Bun.file(benchmarkRunPaths(runsDirectory, run).reviewFile);
	try {
		if (!(await file.exists())) {
			return { reasons: ["No human review recorded"], state: "unavailable" };
		}

		const review = humanReviewSchema.parse(await file.json());

		return { review, state: "available" };
	} catch {
		return {
			reasons: ["The saved human review could not be read"],
			state: "unavailable",
		};
	}
}

export { stoppedStageReads, withJudgedReadManifest, readHumanReview };
