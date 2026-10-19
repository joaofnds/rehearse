import { dirname, join } from "node:path";

import { z } from "zod";

import type { CheckpointRecord } from "./checkpoint";
import { parseCheckpointRecord } from "./checkpoint";
import type { ConfirmationRepRecord } from "./confirmation-record";
import {
	confirmationRepRecordSchema,
	parseConfirmationGroupRecord,
} from "./confirmation-record";
import { pipelineDefinitionSchema } from "./pipeline";
import type { PipelineDefinition } from "./pipeline";
import type runPipelineConfirmation from "./pipeline-confirmation";
import type { ReadManifestEntry } from "./read-manifest";
import { readManifestSchema } from "./read-manifest";

type ConfirmationOutcome = Awaited<ReturnType<typeof runPipelineConfirmation>>;

async function readGroup(
	outcome: ConfirmationOutcome,
): Promise<ReturnType<typeof parseConfirmationGroupRecord>> {
	return parseConfirmationGroupRecord(
		await Bun.file(outcome.groupRecordFile).text(),
	);
}

async function readReps(
	outcome: ConfirmationOutcome,
): Promise<readonly ConfirmationRepRecord[]> {
	return await Promise.all(
		outcome.repRecordFiles.map(async (path) =>
			confirmationRepRecordSchema.parse(
				JSON.parse(await Bun.file(path).text()),
			),
		),
	);
}

async function readCheckpoints(
	outcome: ConfirmationOutcome,
): Promise<readonly CheckpointRecord[]> {
	const directory = dirname(outcome.groupRecordFile);
	const files = await Array.fromAsync(
		new Bun.Glob("reps/**/checkpoint.json").scan(directory),
	);

	return await Promise.all(
		files.map(async (file) =>
			parseCheckpointRecord(await Bun.file(join(directory, file)).text()),
		),
	);
}

interface FrozenInputRequest {
	readonly outcome: ConfirmationOutcome;
	readonly kind: "pipeline" | "checkpoint";
}

async function readFrozenInputText({
	outcome,
	kind,
}: FrozenInputRequest): Promise<string> {
	const group = await readGroup(outcome);
	const entry = group.inputs.files.find((file) => file.kind === kind);
	if (entry === undefined) {
		throw new Error(`Expected a frozen ${kind} input`);
	}

	const text = await Bun.file(
		join(dirname(outcome.groupRecordFile), entry.path),
	).text();
	return text;
}

async function readFrozenPipeline(
	outcome: ConfirmationOutcome,
): Promise<PipelineDefinition> {
	const text = await readFrozenInputText({ kind: "pipeline", outcome });
	return pipelineDefinitionSchema.parse(JSON.parse(text));
}

async function readInitialCheckpoint(
	outcome: ConfirmationOutcome,
): Promise<CheckpointRecord> {
	const text = await readFrozenInputText({ kind: "checkpoint", outcome });
	return parseCheckpointRecord(text);
}

const successfulFinalSchema = z.object({
	grade: z.object({ verdict: z.literal("PASS") }),
});
type SuccessfulFinalEvidence = z.infer<typeof successfulFinalSchema>;
const FIRST_REP_RECORD_INDEX = 0;

async function readSuccessfulFinalEvidence(
	outcome: ConfirmationOutcome,
): Promise<SuccessfulFinalEvidence> {
	const records = await readReps(outcome);
	const successfulFinal = records[FIRST_REP_RECORD_INDEX]?.finalOutcome;
	if (successfulFinal?.status !== "JUDGED") {
		throw new Error("Expected a judged final outcome");
	}

	const [firstRecordFile] = outcome.repRecordFiles;
	if (firstRecordFile === undefined) {
		throw new Error("Expected the first rep record");
	}

	const text = await Bun.file(
		join(dirname(firstRecordFile), successfulFinal.evidence.recordFile),
	).text();
	return successfulFinalSchema.parse(JSON.parse(text));
}

async function readFirstRep(
	outcome: ConfirmationOutcome,
): Promise<ConfirmationRepRecord> {
	const [record] = await readReps(outcome);
	if (record === undefined) {
		throw new Error("Expected the first confirmation record");
	}

	return record;
}

interface StageManifestRequest {
	readonly outcome: ConfirmationOutcome;
	readonly stage: string;
}
const stageManifestSchema = z.object({ readManifest: readManifestSchema });
const rejectedStageManifestSchema = z.object({
	readManifest: readManifestSchema,
	status: z.literal("REJECTED"),
});
type RejectedStageManifest = z.infer<typeof rejectedStageManifestSchema>;

async function stageManifestFiles({
	outcome,
	stage,
}: StageManifestRequest): Promise<readonly string[]> {
	const directory = dirname(outcome.groupRecordFile);
	const files = await Array.fromAsync(
		new Bun.Glob(`reps/*/stages/${stage}.json`).scan(directory),
	);
	return files.map((file) => join(directory, file));
}

async function readStageManifests(
	request: StageManifestRequest,
): Promise<readonly (readonly ReadManifestEntry[])[]> {
	const files = await stageManifestFiles(request);
	return await Promise.all(
		files.map(
			async (file) =>
				stageManifestSchema.parse(JSON.parse(await Bun.file(file).text()))
					.readManifest,
		),
	);
}

async function readRejectedStageManifests(
	request: StageManifestRequest,
): Promise<readonly RejectedStageManifest[]> {
	const files = await stageManifestFiles(request);
	return await Promise.all(
		files.map(async (file) =>
			rejectedStageManifestSchema.parse(
				JSON.parse(await Bun.file(file).text()),
			),
		),
	);
}

export {
	readStageManifests,
	readRejectedStageManifests,
	readFirstRep,
	readSuccessfulFinalEvidence,
	readCheckpoints,
	readFrozenPipeline,
	readGroup,
	readInitialCheckpoint,
	readReps,
};
export type { ConfirmationOutcome };
