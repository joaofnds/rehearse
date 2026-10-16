import { relative } from "node:path";
import { stageScorecardSchema } from "#benchmark/contracts";
import {
	benchmarkRunPaths,
	checkpointsEntryForRun,
} from "#benchmark/run-layout";
import {
	canonicalRunsRoot,
	parseIdentity,
	readVerifiedFile,
	runManifest,
	verifiedDirectory,
	verifiedFile,
	SessionHistoryReaderError,
} from "./session-history-reader";
import { verifiedStageOfRun } from "./stage-record";

import {
	savedOutputRecordSchema,
	projectSavedStepOutput,
	finalAssessmentRecordSchema,
	projectFinalAssessment,
} from "./evidence-projection";
import type { SavedStageOutput, FinalAssessment } from "./evidence-projection";

export type { SavedStageOutput, FinalAssessment } from "./evidence-projection";
/** Read saved Judge input, never a current file or an inferred successful example. */
export async function readStageOutput(request: {
	readonly runsDirectory: string;
	readonly run: string;
	readonly stage: string;
}): Promise<SavedStageOutput> {
	const { runsRoot, run, stage } = await verifiedStageOfRun(request);
	const file = await verifiedFile(
		runsRoot,
		runsRoot,
		relative(runsRoot, benchmarkRunPaths(runsRoot, run).stageFile(stage)),
		false,
	);
	if (file === undefined) {
		return {
			state: "unavailable",
			reason: "This step has no saved output record.",
		};
	}
	const text = await readVerifiedFile(runsRoot, file);
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return {
			state: "unavailable",
			reason: "The saved step record could not be read.",
		};
	}
	const identity = stageScorecardSchema.pick({ stage: true }).safeParse(value);
	if (!identity.success) {
		return {
			state: "unavailable",
			reason: "This record does not identify its saved step output.",
		};
	}
	if (identity.data.stage !== stage) {
		throw new SessionHistoryReaderError(
			"refused",
			"The saved output names a different step.",
		);
	}
	const parsed = savedOutputRecordSchema.safeParse(value);
	return parsed.success
		? projectSavedStepOutput(parsed.data).output
		: {
				state: "unavailable",
				reason: "The saved step record does not retain readable output.",
			};
}

/** Final criteria come from the independent final Judge, not the step letters. */
export async function readFinalAssessment(request: {
	readonly runsDirectory: string;
	readonly run: string;
}): Promise<FinalAssessment> {
	const run = parseIdentity(request.run);
	const root = await canonicalRunsRoot(request.runsDirectory);
	const checkpoints = await verifiedDirectory(root, [
		checkpointsEntryForRun(run),
	]);
	await runManifest(root, checkpoints);
	const file = await verifiedFile(
		root,
		root,
		relative(root, benchmarkRunPaths(root, run).artifactFile),
		false,
	);
	if (file === undefined) {
		return {
			state: "unavailable",
			reason: "No final Judge record was saved.",
		} as const;
	}
	const text = await readVerifiedFile(root, file);
	try {
		const document: unknown = JSON.parse(text);
		const parsed = finalAssessmentRecordSchema.safeParse(document);
		return parsed.success
			? projectFinalAssessment(parsed.data)
			: {
					state: "unavailable",
					reason:
						"This record retains no readable final criteria or citations.",
				};
	} catch (error) {
		if (!(error instanceof SyntaxError)) {
			throw error;
		}
		return {
			state: "unavailable",
			reason: "The final Judge record could not be read.",
		};
	}
}
