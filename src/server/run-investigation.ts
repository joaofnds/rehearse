import { relative } from "node:path";

import {
	benchmarkRunPaths,
	checkpointsEntryForRun,
} from "#benchmark/run-layout";
import type {
	FinalAssessment,
	SavedStageOutput,
} from "#server/evidence-projection";
import {
	recordedFinalAssessment,
	recordedStepOutput,
} from "#server/run-investigation-output-reading";
import {
	canonicalRunsRoot,
	parseIdentity,
	readVerifiedFile,
	runManifest,
	verifiedDirectory,
	verifiedFile,
} from "#server/session-history-reader";
import { verifiedStageOfRun } from "#server/stage-record";

interface StageOutputRequest {
	readonly runsDirectory: string;
	readonly run: string;
	readonly stage: string;
}

/** Read saved Judge input, never a current file or an inferred successful example. */
async function readStageOutput(
	request: StageOutputRequest,
): Promise<SavedStageOutput> {
	const { runsRoot, run, stage } = await verifiedStageOfRun(request);
	const file = await verifiedFile(runsRoot, {
		directory: runsRoot,
		name: relative(runsRoot, benchmarkRunPaths(runsRoot, run).stageFile(stage)),
		required: false,
	});
	if (file === undefined) {
		return {
			reason: "This step has no saved output record.",
			state: "unavailable",
		};
	}

	const text = await readVerifiedFile(runsRoot, file);
	return recordedStepOutput(text, stage);
}

interface FinalAssessmentRequest {
	readonly runsDirectory: string;
	readonly run: string;
}

/** Final criteria come from the independent final Judge, not the step letters. */
async function readFinalAssessment(
	request: FinalAssessmentRequest,
): Promise<FinalAssessment> {
	const run = parseIdentity(request.run);
	const root = await canonicalRunsRoot(request.runsDirectory);
	const checkpoints = await verifiedDirectory(root, [
		checkpointsEntryForRun(run),
	]);
	await runManifest(root, checkpoints);
	const file = await verifiedFile(root, {
		directory: root,
		name: relative(root, benchmarkRunPaths(root, run).artifactFile),
		required: false,
	});
	if (file === undefined) {
		return {
			reason: "No final Judge record was saved.",
			state: "unavailable",
		} as const;
	}

	const text = await readVerifiedFile(root, file);
	return recordedFinalAssessment(text);
}

export { readStageOutput, readFinalAssessment };
export type {
	SavedStageOutput,
	FinalAssessment,
} from "#server/evidence-projection";
