import { checkpointStageAt, resolveShortId } from "#benchmark/short-id";
import { RefusedPreconditionError } from "#cli/interactive-stdin";
import type { RecordId, RunRecordId, ShortIdReference } from "#cli/record-id";
import { parseRecordReference } from "#cli/record-id";
import { frozenStages } from "#cli/short-id-column";

/**
 * The Record ID a short id names, read from the registry and, for a
 * checkpoint, from the stages the run froze into its manifest. A short id that
 * names nothing is refused the way a Record ID naming no file is.
 */

interface ShortCheckpointRequest {
	readonly given: string;
	readonly record: RunRecordId;
	readonly runsDirectory: string;
	readonly stageNumber: number;
}

async function resolvedCheckpoint({
	given,
	record,
	runsDirectory,
	stageNumber,
}: ShortCheckpointRequest): Promise<RecordId> {
	const stages = await frozenStages({ run: record.run, runsDirectory });

	if (stages === undefined) {
		throw new RefusedPreconditionError(
			`No checkpoint holds short id ${given}: its run's manifest cannot be read`,
		);
	}

	const stage = checkpointStageAt(stages, stageNumber);

	if (stage === undefined) {
		throw new RefusedPreconditionError(
			`No checkpoint holds short id ${given}: its run has no stage ${String(stageNumber)}`,
		);
	}

	return { kind: "checkpoint", run: record.run, stage };
}

async function resolvedShortId(
	given: string,
	reference: ShortIdReference,
	runsDirectory: string,
): Promise<RecordId> {
	const record = await resolveShortId(runsDirectory, {
		caseId: reference.caseId,
		kind: reference.shortKind,
		number: reference.number,
	});

	if (record === undefined) {
		throw new RefusedPreconditionError(`No record holds short id ${given}`);
	}

	if (reference.stage === undefined) {
		return record;
	}

	if (record.kind !== "run") {
		throw new RefusedPreconditionError(
			`No checkpoint holds short id ${given}: it numbers a ${record.kind} record, not a run`,
		);
	}

	return await resolvedCheckpoint({
		given,
		record,
		runsDirectory,
		stageNumber: reference.stage,
	});
}

interface RecordReferenceRequest {
	readonly given: string;
	readonly runsDirectory: string;
}
async function recordIdFor({
	given,
	runsDirectory,
}: RecordReferenceRequest): Promise<RecordId> {
	const reference = parseRecordReference(given);

	return await (reference.kind === "short"
		? resolvedShortId(given, reference, runsDirectory)
		: Promise.resolve(reference));
}

export { recordIdFor as default };
