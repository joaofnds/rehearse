import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { deriveBaselineCorpus } from "./baseline-corpus";
import type { BaselineCorpus } from "./baseline-corpus";
import type { Effort } from "./config";
import type { ConfirmationGroupRecord } from "./confirmation-record";
import { writeComparisonBaselineRecord } from "./comparison-baseline-record";
import { writeComparisonReport } from "./comparison-command";
import { loadComparisonEvidence } from "./comparison-loader";
import type { ComparisonArm } from "./comparison-record";
import { confirmationGroupRecordSchema } from "./confirmation-record";
import {
	corpusVersionDigest,
	readCorpusVersion,
	readCorpusVersionFile,
} from "./corpus-version";
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

const BASELINE_CORPORA_DIRECTORY = "baseline-corpora";
const MANIFESTS_DIRECTORY = "comparison-manifests";

export interface Checkpoint {
	readonly run: string;
	readonly stage: string;
}

/** A recorded replay confirmation group offered as arm A or arm B. */
export interface RecordedArm {
	readonly group: ConfirmationGroupRecord;
	readonly checkpoint: Checkpoint;
	readonly corpusDigest: string;
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

	return {
		group,
		checkpoint: await replayedCheckpoint(runsDirectory, group.caseId, groupId),
		corpusDigest: version.digest,
		corpus: await recordedCorpus(runsDirectory, version.digest),
	};
}

/**
 * Holds arms A and B to the comparability rules a comparison manifest meets,
 * with arm A standing in for the baseline arm not yet run, so arms that could
 * never be compared are refused before any provider call.
 */
async function assertComparableArms(
	runsDirectory: string,
	caseId: string,
	arms: { readonly armA: string; readonly armB: string },
): Promise<void> {
	const armAFile = confirmationGroupPaths(runsDirectory, arms.armA).groupFile;
	const directory = await mkdtemp(join(tmpdir(), "rehearse-compare-attempts-"));
	try {
		const manifestPath = join(directory, "manifest.json");
		await Bun.write(
			manifestPath,
			JSON.stringify({
				schemaVersion: 1,
				cases: [
					{
						caseId,
						arms: {
							baseline: armAFile,
							candidate: confirmationGroupPaths(runsDirectory, arms.armB)
								.groupFile,
							control: armAFile,
						},
					},
				],
			}),
		);
		await loadComparisonEvidence(manifestPath);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

/**
 * Writes the baseline corpus out of arm A's recorded version, under the
 * digest of the files it holds, so a replay can run it as a directory corpus.
 */
async function materializeBaselineCorpus(
	runsDirectory: string,
	armADigest: string,
	files: ReadonlyMap<string, string>,
): Promise<string> {
	const hashed = [...files].map(([path, sha256]) => ({ path, sha256 }));
	const directory = join(
		runsDirectory,
		BASELINE_CORPORA_DIRECTORY,
		corpusVersionDigest(hashed),
	);
	for (const { path } of hashed) {
		await Bun.write(
			join(directory, path),
			await readCorpusVersionFile(runsDirectory, armADigest, path),
		);
	}

	return directory;
}

/**
 * The manifest of arm A as the baseline role, arm B as the candidate and the
 * derived baseline as the control (doc-180 decision 2), named by the control
 * group, which no other comparison ran.
 */
async function writeManifest(
	runsDirectory: string,
	caseId: string,
	arms: Readonly<Record<ComparisonArm, string>>,
): Promise<string> {
	const manifestPath = join(
		runsDirectory,
		MANIFESTS_DIRECTORY,
		`${arms.control}.json`,
	);
	const groupReference = (groupId: string): string =>
		relative(
			dirname(manifestPath),
			confirmationGroupPaths(runsDirectory, groupId).groupFile,
		);
	await Bun.write(
		manifestPath,
		`${JSON.stringify(
			{
				schemaVersion: 1,
				cases: [
					{
						caseId,
						arms: {
							baseline: groupReference(arms.baseline),
							candidate: groupReference(arms.candidate),
							control: groupReference(arms.control),
						},
					},
				],
			},
			null,
			2,
		)}\n`,
	);

	return manifestPath;
}

function describeCheckpoint({ run, stage }: Checkpoint): string {
	return `${run} ${stage}`;
}

/** What the comparison would run, once every check that costs nothing passed. */
export interface ComparisonPlan {
	readonly armA: RecordedArm;
	readonly baseline: Exclude<BaselineCorpus, { readonly kind: "refused" }>;
}

/**
 * Refuses arms that could never be compared, in the order a reader would fix
 * them: the checkpoint, then the controlled inputs, then the corpus difference.
 */
export async function planComparison(
	request: CompareAttemptsRequest,
): Promise<ComparisonPlan> {
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
	await assertComparableArms(request.runsDirectory, armA.group.caseId, request);
	const baseline = deriveBaselineCorpus(armA.corpus, armB.corpus);
	if (baseline.kind === "refused") {
		const units =
			baseline.differingUnits.length > 1
				? `: ${baseline.differingUnits.join(", ")}`
				: "";
		throw new RefusedPreconditionError(`${baseline.reason}${units}`);
	}

	return { armA, baseline };
}

export async function compareAttempts(
	request: CompareAttemptsRequest,
	dependencies: CompareAttemptsDependencies,
): Promise<{ readonly reportFile: string }> {
	const { armA, baseline } = await planComparison(request);

	const { inputs } = armA.group;
	const corpusDirectory = await materializeBaselineCorpus(
		request.runsDirectory,
		armA.corpusDigest,
		baseline.files,
	);
	const control = await dependencies.runBaselineGroup({
		...armA.checkpoint,
		corpusDirectory,
		reps: armA.group.reps,
		model: inputs.model,
		effort: inputs.effort,
		judgeModel: inputs.judgeModel,
		judgeEffort: inputs.judgeEffort,
		sessionBudgetUsd: inputs.sessionBudgetUsd,
	});

	const arms = { baseline: request.armA, candidate: request.armB, control };
	const reportFile = await writeComparisonReport({
		manifestPath: await writeManifest(
			request.runsDirectory,
			armA.group.caseId,
			arms,
		),
		runsDirectory: request.runsDirectory,
	});
	await writeComparisonBaselineRecord(dirname(reportFile), {
		schemaVersion: 1,
		kind: baseline.kind,
		skillUnderTest: baseline.skillUnderTest,
		arms,
		baselineCorpus: basename(corpusDirectory),
	});

	return { reportFile };
}
