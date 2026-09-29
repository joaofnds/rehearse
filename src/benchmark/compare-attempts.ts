import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { deriveBaselineCorpus } from "./baseline-corpus";
import type { BaselineCorpus } from "./baseline-corpus";
import type { Effort } from "./config";
import type { Immutable } from "./contracts";
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
	writeWhole,
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
	readonly group: Immutable<ConfirmationGroupRecord>;
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

export async function recordedArm(
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
 * Each file is written whole and owner-only, as the store holds it, since two
 * comparisons deriving the same baseline share its directory.
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
		const file = join(directory, path);
		await mkdir(dirname(file), { recursive: true });
		await writeWhole(
			file,
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

/**
 * The corpus layout paths a stage group's replayed stage read, which is only
 * the part of the corpus a stage replay freezes: its own skills and the
 * shared directories, never every skill in the corpus.
 */
function stageReadPaths({ group }: RecordedArm): readonly string[] {
	const [stage] = group.declaredStages;

	return group.inputs.files.flatMap(({ kind, path }) => {
		const segments = path.replaceAll("\\", "/").split("/");
		const corpusIndex = segments.lastIndexOf("corpus");

		return kind === "corpus" && segments[corpusIndex + 1] === stage
			? [segments.slice(corpusIndex + 2).join("/")]
			: [];
	});
}

/**
 * Refuses a baseline the replayed stage could not tell apart from arm A, or
 * could not run at all. A stage replay loads only its stage's skills, so a
 * skill it never reads leaves all three arms reading the same files, and a
 * skill it reads cannot be removed, since the replay refuses a stage whose
 * skill is missing (doc-180 decision 2 meets stage snapshotting; see ACT-271.4).
 */
function assertStageReadsBaselineDifference(
	armA: RecordedArm,
	armB: RecordedArm,
	skillUnderTest: string,
): void {
	const { stage } = armA.checkpoint;
	const reads = [armA, armB].some((arm) =>
		stageReadPaths(arm).some((path) => path.startsWith(skillUnderTest)),
	);

	throw new RefusedPreconditionError(
		reads
			? `stage ${stage} loads ${skillUnderTest}, and a stage replay cannot run without it; supply the control through a comparison manifest`
			: `stage ${stage} reads nothing in ${skillUnderTest}, so arms A and B ran the same files and nothing is under test`,
	);
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
	assertStageReadsBaselineDifference(armA, armB, baseline.skillUnderTest);

	return { armA, baseline };
}

export async function compareAttempts(
	request: CompareAttemptsRequest,
	dependencies: CompareAttemptsDependencies,
): Promise<{ readonly reportFile: string }> {
	return runComparison(request, await planComparison(request), dependencies);
}

/**
 * Runs the baseline group a plan names and writes the report. No stage plan
 * passes planComparison today, so only its tests reach this until a stage
 * replay can run without the skill under test (ACT-271.4 notes).
 */
export async function runComparison(
	request: CompareAttemptsRequest,
	{ armA, baseline }: ComparisonPlan,
	dependencies: CompareAttemptsDependencies,
): Promise<{ readonly reportFile: string }> {
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
