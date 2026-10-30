import { z } from "zod";

import type { Checkpoint, RecordedArm } from "./comparison-attempt-contract";
import type { ConfirmationGroupRecord } from "./confirmation-record";
import { confirmationGroupRecordSchema } from "./confirmation-record";
import type { Immutable } from "./contracts";
import { CorpusVersionError, readCorpusVersion } from "./corpus-version";
import { RefusedPreconditionError } from "./exit-codes";
import { confirmationGroupPaths } from "./run-layout";
import { claimedReplaySource, readShortIds } from "./short-id";
import CONFIRMATION_STAGE_SETUP from "./stage-session-contract";
import type { ValidationFieldOrder } from "./validation-issue-order";
import orderedValidationIssues from "./validation-issue-order";

const confirmationGroupValidationOrder: ValidationFieldOrder = {
	children: {
		approval: { fields: ["method", "approved"] },
		inputs: {
			children: {
				corpusVersion: { fields: ["kind", "digest", "refusal"] },
				files: { fields: ["kind", "path", "sha256"] },
				lineage: { fields: ["kind", "sha", "lineage", "targetSha"] },
			},
			fields: [
				"lineage",
				"files",
				"model",
				"effort",
				"judgeModel",
				"judgeEffort",
				"sessionBudgetUsd",
				"spendCeilingUsd",
				"pipelinePath",
				"corpusVersion",
			],
		},
		projectedCost: {
			fields: ["reps", "perRepMaximumUsd", "totalMaximumUsd"],
		},
		repRecords: { fields: ["repId", "ordinal", "path"] },
	},
	fields: [
		"schemaVersion",
		"caseId",
		"groupId",
		"mode",
		"reps",
		"declaredStages",
		"inputs",
		"projectedCost",
		"approval",
		"repRecords",
		"reportFile",
		"makespanMs",
		"startedAt",
	],
	refinements: [
		{ code: "custom", path: ["repRecords"] },
		{ code: "custom", path: ["projectedCost", "reps"] },
	],
};

async function replayedCheckpoint(
	runsDirectory: string,
	caseId: string,
	groupId: string,
): Promise<Checkpoint> {
	const source = claimedReplaySource(
		await readShortIds(runsDirectory, caseId),
		groupId,
	);
	if (source === undefined) {
		throw new RefusedPreconditionError(
			`group ${groupId} records no checkpoint it replayed`,
		);
	}

	return source;
}

async function recordedCorpus(
	runsDirectory: string,
	groupId: string,
	digest: string,
): Promise<ReadonlyMap<string, string>> {
	try {
		const files = await readCorpusVersion(runsDirectory, digest);

		return new Map(files.map(({ path, sha256 }) => [path, sha256]));
	} catch (error) {
		if (!(error instanceof CorpusVersionError)) {
			throw error;
		}
		throw new RefusedPreconditionError(
			`group ${groupId} ran corpus version ${digest}, which cannot be read: ${error.message}`,
		);
	}
}

async function recordedGroup(
	runsDirectory: string,
	groupId: string,
): Promise<ConfirmationGroupRecord> {
	const file = Bun.file(
		confirmationGroupPaths(runsDirectory, groupId).groupFile,
	);
	if (!(await file.exists())) {
		throw new RefusedPreconditionError(
			`No recorded confirmation group ${groupId}`,
		);
	}
	try {
		return confirmationGroupRecordSchema.parse(JSON.parse(await file.text()));
	} catch (error) {
		if (!(error instanceof SyntaxError || error instanceof z.ZodError)) {
			throw error;
		}
		const message =
			error instanceof z.ZodError
				? new z.ZodError([
						...orderedValidationIssues({
							error,
							order: confirmationGroupValidationOrder,
						}),
					]).message
				: error.message;
		throw new RefusedPreconditionError(
			`group ${groupId} is not a confirmation group record this comparison can read: ${message}`,
		);
	}
}

/**
 * A group recorded before delivery let its home-path citations read the live
 * install, so neither arm's copy of a cited file is what its reps read.
 */
function refuseUndeliveredCorpus(
	group: Immutable<ConfirmationGroupRecord>,
): void {
	if (group.inputs.corpusDelivery === undefined) {
		throw new RefusedPreconditionError(
			`group ${group.groupId} records no corpus delivery, so its home-path citations read the live install and it cannot be compared until it is run again`,
		);
	}
}

async function recordedArm(
	runsDirectory: string,
	groupId: string,
): Promise<RecordedArm> {
	const group = await recordedGroup(runsDirectory, groupId);

	if (group.mode !== "stage") {
		throw new RefusedPreconditionError(
			`group ${groupId} is a ${group.mode} group; only stage groups replay one checkpoint`,
		);
	}
	const version = group.inputs.corpusVersion;
	if (version?.kind !== "version") {
		throw new RefusedPreconditionError(
			`group ${groupId} records no corpus version`,
		);
	}
	if (group.inputs.setup !== CONFIRMATION_STAGE_SETUP) {
		throw new RefusedPreconditionError(
			`group ${groupId} records no setup, so it ran before groups recorded one, and a group replayed now under the ${CONFIRMATION_STAGE_SETUP} setup cannot be compared with it`,
		);
	}
	refuseUndeliveredCorpus(group);

	return {
		checkpoint: await replayedCheckpoint(runsDirectory, group.caseId, groupId),
		corpus: await recordedCorpus(runsDirectory, groupId, version.digest),
		corpusDigest: version.digest,
		group,
	};
}

export { recordedArm as default };
