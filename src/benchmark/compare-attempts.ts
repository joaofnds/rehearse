import { deriveBaselineCorpus } from "./baseline-corpus";
import type { Effort } from "./config";
import { confirmationGroupRecordSchema } from "./confirmation-record";
import { readCorpusVersion } from "./corpus-version";
import { RefusedPreconditionError } from "./exit-codes";
import { confirmationGroupPaths } from "./run-layout";

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

async function recordedCorpus(
	runsDirectory: string,
	groupId: string,
): Promise<ReadonlyMap<string, string>> {
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
	const files = await readCorpusVersion(runsDirectory, version.digest);

	return new Map(files.map(({ path, sha256 }) => [path, sha256]));
}

export async function compareAttempts(
	request: CompareAttemptsRequest,
	_dependencies: CompareAttemptsDependencies,
): Promise<{ readonly reportFile: string }> {
	const baseline = deriveBaselineCorpus(
		await recordedCorpus(request.runsDirectory, request.armA),
		await recordedCorpus(request.runsDirectory, request.armB),
	);
	if (baseline.kind === "refused") {
		throw new RefusedPreconditionError(baseline.reason);
	}

	throw new Error("not implemented");
}
