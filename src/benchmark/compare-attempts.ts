import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { z } from "zod";
import { deriveBaselineCorpus } from "./baseline-corpus";
import type { BaselineCorpus } from "./baseline-corpus";
import type { Effort } from "./config";
import type { Immutable } from "./contracts";
import type { ConfirmationGroupRecord } from "./confirmation-record";
import { writeComparisonBaselineRecord } from "./comparison-baseline-record";
import { writeComparisonReport } from "./comparison-command";
import { loadComparisonEvidence } from "./comparison-loader";
import type { ComparisonArm } from "./comparison-record";
import { executedCorpusFiles } from "./comparison-comparability";
import { confirmationGroupRecordSchema } from "./confirmation-record";
import {
	CorpusVersionError,
	corpusVersionDigest,
	readCorpusVersion,
	readCorpusVersionFile,
	writeWhole,
} from "./corpus-version";
import { RefusedPreconditionError } from "./exit-codes";
import { comparisonReportPaths, confirmationGroupPaths } from "./run-layout";
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
	/** The rubric arm A was graded on, which the baseline must be graded on too. */
	readonly rubricSha256: string;
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

/** The arm's group record, refusing one that is missing or of another shape. */
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
		throw new RefusedPreconditionError(
			`group ${groupId} is not a confirmation group record this comparison can read: ${error.message}`,
		);
	}
}

export async function recordedArm(
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

	return {
		group,
		checkpoint: await replayedCheckpoint(runsDirectory, group.caseId, groupId),
		corpusDigest: version.digest,
		corpus: await recordedCorpus(runsDirectory, groupId, version.digest),
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

/** The manifest's digest, which names its report directory. */
async function fileDigest(file: string): Promise<string> {
	return createHash("sha256")
		.update(await Bun.file(file).bytes())
		.digest("hex");
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
	return executedCorpusFiles(group).map(({ path }) => {
		const segments = path.replaceAll("\\", "/").split("/");

		return segments.slice(segments.lastIndexOf("corpus") + 2).join("/");
	});
}

/**
 * A stage replay freezes only its stage's own skill, so a skill under test
 * the stage never reads leaves all three arms reading the same files. One it
 * reads is the stage's own, which the baseline replays without.
 */
function assertStageReadsSkillUnderTest(
	armA: RecordedArm,
	armB: RecordedArm,
	skillUnderTest: string,
): void {
	const reads = [armA, armB].some((arm) =>
		stageReadPaths(arm).some((path) => path.startsWith(skillUnderTest)),
	);
	if (!reads) {
		throw new RefusedPreconditionError(
			`stage ${armA.checkpoint.stage} reads nothing in ${skillUnderTest}, so arms A and B ran the same files and nothing is under test`,
		);
	}
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
	assertStageReadsSkillUnderTest(armA, armB, baseline.skillUnderTest);

	return { armA, baseline };
}

export async function compareAttempts(
	request: CompareAttemptsRequest,
	dependencies: CompareAttemptsDependencies,
): Promise<{ readonly reportFile: string }> {
	return runComparison(request, await planComparison(request), dependencies);
}

function frozenRubricSha256(armA: RecordedArm): string {
	const rubric = armA.group.inputs.files.find(({ kind }) => kind === "rubric");
	if (rubric === undefined) {
		throw new RefusedPreconditionError(
			`group ${armA.group.groupId} froze no rubric`,
		);
	}

	return rubric.sha256;
}

/** Runs the baseline group a plan names and writes the report. */
async function runComparison(
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
		rubricSha256: frozenRubricSha256(armA),
	});

	const arms = { baseline: request.armA, candidate: request.armB, control };
	const manifestPath = await writeManifest(
		request.runsDirectory,
		armA.group.caseId,
		arms,
	);
	const reportDirectory = comparisonReportPaths(
		request.runsDirectory,
		await fileDigest(manifestPath),
	).directory;
	await writeComparisonBaselineRecord(reportDirectory, {
		schemaVersion: 2,
		kind: baseline.kind,
		skillUnderTest: baseline.skillUnderTest,
		arms,
		controlCorpus: basename(corpusDirectory),
	});
	const reportFile = await writeComparisonReport({
		manifestPath,
		runsDirectory: request.runsDirectory,
	});
	if (dirname(reportFile) !== reportDirectory) {
		throw new Error(
			`The report was written to ${dirname(reportFile)}, not beside its baseline record in ${reportDirectory}`,
		);
	}

	return { reportFile };
}
