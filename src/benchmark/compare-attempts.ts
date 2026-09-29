import { deriveBaselineCorpus } from "./baseline-corpus";
import type { Effort } from "./config";
import type { ConfirmationGroupRecord } from "./confirmation-record";
import { confirmationGroupRecordSchema } from "./confirmation-record";
import { readCorpusVersion } from "./corpus-version";
import { RefusedPreconditionError } from "./exit-codes";
import { confirmationGroupPaths } from "./run-layout";
import { readShortIds } from "./short-id";

/**
 * The baseline arm's confirmation group, replayed at the checkpoint arms A
 * and B replayed, against a corpus directory, with arm A's controlled inputs.
 */
export interface BaselineGroupRequest {
	readonly run: string;
	readonly stage: string;
	readonly corpusDirectory: string;
	readonly reps: number;
	readonly model: string;
	readonly effort: Effort | undefined;
	readonly judgeModel: string;
	readonly judgeEffort: Effort | undefined;
	readonly sessionBudgetUsd: number;
}

export interface CompareAttemptsRequest {
	readonly runsDirectory: string;
	readonly armA: string;
	readonly armB: string;
}

export interface CompareAttemptsDependencies {
	/** Runs the baseline group and answers with its group id. */
	readonly runBaselineGroup: (request: BaselineGroupRequest) => Promise<string>;
}

interface Checkpoint {
	readonly run: string;
	readonly stage: string;
}

/** A recorded replay confirmation group offered as arm A or arm B. */
interface RecordedArm {
	readonly group: ConfirmationGroupRecord;
	readonly checkpoint: Checkpoint;
	readonly corpus: ReadonlyMap<string, string>;
}

/**
 * The checkpoint a group replayed, which only its short-id claim records,
 * since the group record carries a lineage two runs can share.
 */
async function replayedCheckpoint(
	runsDirectory: string,
	caseId: string,
	groupId: string,
): Promise<Checkpoint> {
	const entries = await readShortIds(runsDirectory, caseId);
	const claim = entries.find(
		({ record }) => record.kind === "group" && record.groupId === groupId,
	);
	if (claim?.record.kind !== "group" || claim.record.source === undefined) {
		throw new RefusedPreconditionError(
			`group ${groupId} records no checkpoint it replayed`,
		);
	}

	return claim.record.source;
}

async function recordedCorpus(
	runsDirectory: string,
	digest: string,
): Promise<ReadonlyMap<string, string>> {
	const files = await readCorpusVersion(runsDirectory, digest);

	return new Map(files.map(({ path, sha256 }) => [path, sha256]));
}

async function recordedArm(
	runsDirectory: string,
	groupId: string,
): Promise<RecordedArm> {
	const group = confirmationGroupRecordSchema.parse(
		JSON.parse(
			await Bun.file(
				confirmationGroupPaths(runsDirectory, groupId).groupFile,
			).text(),
		),
	);

	const version = group.inputs.corpusVersion;
	if (version?.kind !== "version") {
		throw new RefusedPreconditionError(
			`group ${groupId} records no corpus version`,
		);
	}

	return {
		group,
		checkpoint: await replayedCheckpoint(runsDirectory, group.caseId, groupId),
		corpus: await recordedCorpus(runsDirectory, version.digest),
	};
}

function describeCheckpoint({ run, stage }: Checkpoint): string {
	return `${run} ${stage}`;
}

export async function compareAttempts(
	request: CompareAttemptsRequest,
	_dependencies: CompareAttemptsDependencies,
): Promise<{ readonly reportFile: string }> {
	const armA = await recordedArm(request.runsDirectory, request.armA);
	const armB = await recordedArm(request.runsDirectory, request.armB);
	if (
		armA.checkpoint.run !== armB.checkpoint.run ||
		armA.checkpoint.stage !== armB.checkpoint.stage
	) {
		throw new RefusedPreconditionError(
			`arms A and B replayed different checkpoints: ${describeCheckpoint(armA.checkpoint)} and ${describeCheckpoint(armB.checkpoint)}`,
		);
	}
	const baseline = deriveBaselineCorpus(armA.corpus, armB.corpus);
	if (baseline.kind === "refused") {
		const units =
			baseline.differingUnits.length > 1
				? `: ${baseline.differingUnits.join(", ")}`
				: "";
		throw new RefusedPreconditionError(`${baseline.reason}${units}`);
	}

	throw new Error("not implemented");
}
