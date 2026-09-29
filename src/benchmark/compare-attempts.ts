import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { z } from "zod";
import { deriveBaselineCorpus } from "./baseline-corpus";
import type { BaselineCorpus } from "./baseline-corpus";
import type { ComparisonBaselineRecord } from "./comparison-baseline-record";
import { readComparisonBaselineRecord } from "./comparison-baseline-record";
import type { Effort } from "./config";
import type { Immutable } from "./contracts";
import { unhandled } from "./contracts";
import type { ConfirmationGroupRecord } from "./confirmation-record";
import { writeComparisonReport } from "./comparison-command";
import { loadComparisonEvidence } from "./comparison-loader";
import type {
	ComparisonArm,
	ComparisonManifestText,
} from "./comparison-record";
import { parseComparisonReport } from "./comparison-record";
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
import type { MoreAttemptsCost } from "./more-attempts-cost";
import { moreAttemptsCost } from "./more-attempts-cost";
import { loadRunManifest } from "./manifest";
import {
	benchmarkRunPaths,
	comparisonReportPaths,
	confirmationGroupPaths,
} from "./run-layout";
import { readShortIds } from "./short-id";
import { loadStageRubric } from "./stage-grading";

/**
 * One arm's confirmation group, replayed at the checkpoint arms A and B
 * replayed, against a corpus directory, with arm A's controlled inputs. The
 * baseline arm replays without the stage's own skill.
 */
export interface ArmGroupRequest {
	readonly role: ComparisonArm;
	readonly withoutStageSkill: boolean;
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
	readonly runBaselineGroup: (request: ArmGroupRequest) => Promise<string>;
}

export interface ExtendComparisonRequest {
	readonly runsDirectory: string;
	/** The manifest digest naming the comparison to extend. */
	readonly comparison: string;
	readonly attemptsPerArm: number;
}

export interface ExtendComparisonDependencies {
	/** Stops the extension unless its stated cost is approved. */
	readonly approve: (cost: ExtensionPlan["cost"]) => Promise<void>;
	/** Runs one arm's added group and answers with its group id. */
	readonly runArmGroup: (request: ArmGroupRequest) => Promise<string>;
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

/** A comparison manifest of one case, each role naming its group files. */
function singleCaseManifest(
	caseId: string,
	groupFiles: ComparisonManifestText["cases"][number]["arms"],
): ComparisonManifestText {
	return { schemaVersion: 1, cases: [{ caseId, arms: groupFiles }] };
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
			JSON.stringify(
				singleCaseManifest(caseId, {
					baseline: armAFile,
					candidate: confirmationGroupPaths(runsDirectory, arms.armB).groupFile,
					control: armAFile,
				}),
			),
		);
		await loadComparisonEvidence(manifestPath);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

/**
 * Writes an arm's corpus out of a recorded version, under the digest of the
 * files it holds, so a replay can run it as a directory corpus. Each file is
 * written whole and owner-only, as the store holds it, since two comparisons
 * running the same corpus share its directory.
 */
async function materializeCorpus(
	runsDirectory: string,
	versionDigest: string,
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
			await readCorpusVersionFile(runsDirectory, versionDigest, path),
		);
	}

	return directory;
}

type ArmGroups = ComparisonBaselineRecord["arms"];

/**
 * The manifest of arm A as the baseline role, arm B as the candidate and the
 * derived baseline as the control (doc-180 decision 2), named by the last
 * control group, which no other comparison ran. An arm of one group names
 * its group file alone, as manifests did before arms held several.
 */
async function writeManifest(
	runsDirectory: string,
	caseId: string,
	arms: ArmGroups,
): Promise<string> {
	const manifestPath = join(
		runsDirectory,
		MANIFESTS_DIRECTORY,
		`${arms.control.at(-1) ?? arms.control[0]}.json`,
	);
	const groupReference = (groupId: string): string =>
		relative(
			dirname(manifestPath),
			confirmationGroupPaths(runsDirectory, groupId).groupFile,
		);
	const armReference = ([
		first,
		...rest
	]: ArmGroups[ComparisonArm]): ComparisonManifestText["cases"][number]["arms"][ComparisonArm] =>
		rest.length === 0
			? groupReference(first)
			: [
					groupReference(first),
					...rest.map((groupId) => groupReference(groupId)),
				];
	await Bun.write(
		manifestPath,
		`${JSON.stringify(
			singleCaseManifest(caseId, {
				baseline: armReference(arms.baseline),
				candidate: armReference(arms.candidate),
				control: armReference(arms.control),
			}),
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

/**
 * Replay grades the baseline on the stage's rubric as it stands now, so a
 * rubric edited since arm A was recorded would have its group refused by the
 * comparison only after it was paid for. The run's manifest names the rubric
 * replay will load, so the edit is refused before replay starts. The same
 * pipeline names the stage's own skill, the only one replay can remove.
 */
async function assertBaselineGradesOnArmARubric(
	runsDirectory: string,
	armA: RecordedArm,
	skillUnderTest: string,
): Promise<void> {
	const { run, stage: stageName } = armA.checkpoint;
	const manifest = await loadRunManifest(
		benchmarkRunPaths(runsDirectory, run).manifestFile,
	);
	const stage = manifest.pipeline.stages.find(({ name }) => name === stageName);
	if (stage === undefined) {
		throw new RefusedPreconditionError(
			`the ${run} run's pipeline has no ${stageName} stage, so no rubric can grade a baseline group against arm A`,
		);
	}
	if (skillUnderTest !== `skills/${stage.skill}/`) {
		throw new RefusedPreconditionError(
			`${skillUnderTest} is not the ${stage.name} stage's own skill, which is the only skill a baseline replay can run without`,
		);
	}

	let content: string;
	try {
		({ content } = await loadStageRubric(stage));
	} catch (error) {
		throw new RefusedPreconditionError(
			`the ${stage.rubric} rubric cannot be read, so a baseline group run now could not be compared with arm A: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	if (
		createHash("sha256").update(content).digest("hex") !==
		frozenRubricSha256(armA)
	) {
		throw new RefusedPreconditionError(
			`the ${stage.rubric} rubric changed since arm A was recorded, so a baseline group run now could not be compared with it`,
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
	await assertBaselineGradesOnArmARubric(
		request.runsDirectory,
		armA,
		baseline.skillUnderTest,
	);

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
	const corpusDirectory = await materializeCorpus(
		request.runsDirectory,
		armA.corpusDigest,
		baseline.files,
	);
	const control = await dependencies.runBaselineGroup({
		role: "control",
		withoutStageSkill: true,
		...armA.checkpoint,
		corpusDirectory,
		reps: armA.group.reps,
		model: inputs.model,
		effort: inputs.effort,
		judgeModel: inputs.judgeModel,
		judgeEffort: inputs.judgeEffort,
		sessionBudgetUsd: inputs.sessionBudgetUsd,
	});

	const arms: ArmGroups = {
		baseline: [request.armA],
		candidate: [request.armB],
		control: [control],
	};
	const manifestPath = await writeManifest(
		request.runsDirectory,
		armA.group.caseId,
		arms,
	);
	const reportFile = await writeComparisonReport({
		manifestPath,
		runsDirectory: request.runsDirectory,
		baselineRecord: {
			schemaVersion: 3,
			kind: baseline.kind,
			skillUnderTest: baseline.skillUnderTest,
			arms,
			controlCorpus: basename(corpusDirectory),
		},
	});

	return { reportFile };
}

/** What an extension would run, once every check that costs nothing passed. */
export interface ExtensionPlan {
	readonly cost: Extract<MoreAttemptsCost, { readonly state: "available" }>;
	readonly record: ComparisonBaselineRecord;
	readonly armA: RecordedArm;
	readonly armB: RecordedArm;
}

/** How `compare attempts` made the comparison, which says how to replay it. */
async function extendedRecord(
	reportDirectory: string,
	comparison: string,
): Promise<ComparisonBaselineRecord> {
	const recorded = await readComparisonBaselineRecord(reportDirectory);
	switch (recorded.kind) {
		case "recorded": {
			return recorded.record;
		}
		case "supplied": {
			throw new RefusedPreconditionError(
				`comparison ${comparison} was not made by compare attempts, so nothing records the checkpoint and corpora its arms would replay`,
			);
		}
		case "unreadable": {
			throw new RefusedPreconditionError(
				`comparison ${comparison} cannot be extended: ${recorded.reason}`,
			);
		}
		default: {
			return unhandled(recorded, "baseline record");
		}
	}
}

/**
 * Refuses an extension whose cost cannot be stated, or whose added groups
 * the comparison would refuse only after they were paid for.
 */
export async function planExtension(
	request: ExtendComparisonRequest,
): Promise<ExtensionPlan> {
	const paths = comparisonReportPaths(
		request.runsDirectory,
		request.comparison,
	);
	const reportFile = Bun.file(paths.reportFile);
	if (!(await reportFile.exists())) {
		throw new RefusedPreconditionError(
			`No saved comparison ${request.comparison}`,
		);
	}
	const record = await extendedRecord(paths.directory, request.comparison);
	const [benchmarkCase] = parseComparisonReport(await reportFile.text()).cases;
	if (benchmarkCase === undefined) {
		throw new Error(`comparison ${request.comparison} holds no case`);
	}
	const cost = moreAttemptsCost(
		{
			baseline: benchmarkCase.arms.baseline.resources,
			candidate: benchmarkCase.arms.candidate.resources,
			control: benchmarkCase.arms.control.resources,
		},
		request.attemptsPerArm,
	);
	if (cost.state === "unavailable") {
		throw new RefusedPreconditionError(
			`what ${request.attemptsPerArm} more attempts per arm would cost cannot be stated: ${cost.reasons.join("; ")}`,
		);
	}
	const armA = await recordedArm(
		request.runsDirectory,
		record.arms.baseline[0],
	);
	const armB = await recordedArm(
		request.runsDirectory,
		record.arms.candidate[0],
	);
	await assertBaselineGradesOnArmARubric(
		request.runsDirectory,
		armA,
		record.skillUnderTest,
	);

	return { cost, record, armA, armB };
}

export async function extendComparison(
	request: ExtendComparisonRequest,
	dependencies: ExtendComparisonDependencies,
): Promise<{ readonly reportFile: string }> {
	const plan = await planExtension(request);
	await dependencies.approve(plan.cost);

	return runExtension(request, plan, dependencies);
}

/**
 * Replays the attempts asked for in every arm, each on the corpus it ran,
 * and writes the comparison of every arm's groups, old and added.
 */
async function runExtension(
	request: ExtendComparisonRequest,
	{ record, armA, armB }: ExtensionPlan,
	dependencies: ExtendComparisonDependencies,
): Promise<{ readonly reportFile: string }> {
	const { runsDirectory } = request;
	const baseline = deriveBaselineCorpus(armA.corpus, armB.corpus);
	if (baseline.kind === "refused") {
		throw new Error(
			`the baseline corpus of comparison ${request.comparison} can no longer be derived: ${baseline.reason}`,
		);
	}
	const { inputs } = armA.group;
	const replay = {
		...armA.checkpoint,
		reps: request.attemptsPerArm,
		model: inputs.model,
		effort: inputs.effort,
		judgeModel: inputs.judgeModel,
		judgeEffort: inputs.judgeEffort,
		sessionBudgetUsd: inputs.sessionBudgetUsd,
	};

	const added = {
		baseline: await dependencies.runArmGroup({
			...replay,
			role: "baseline",
			withoutStageSkill: false,
			corpusDirectory: await materializeCorpus(
				runsDirectory,
				armA.corpusDigest,
				armA.corpus,
			),
		}),
		candidate: await dependencies.runArmGroup({
			...replay,
			role: "candidate",
			withoutStageSkill: false,
			corpusDirectory: await materializeCorpus(
				runsDirectory,
				armB.corpusDigest,
				armB.corpus,
			),
		}),
		control: await dependencies.runArmGroup({
			...replay,
			role: "control",
			withoutStageSkill: true,
			corpusDirectory: await materializeCorpus(
				runsDirectory,
				armA.corpusDigest,
				baseline.files,
			),
		}),
	};

	const arms: ArmGroups = {
		baseline: [...record.arms.baseline, added.baseline],
		candidate: [...record.arms.candidate, added.candidate],
		control: [...record.arms.control, added.control],
	};
	const reportFile = await writeComparisonReport({
		manifestPath: await writeManifest(runsDirectory, armA.group.caseId, arms),
		runsDirectory,
		baselineRecord: { ...record, arms, extends: request.comparison },
	});

	return { reportFile };
}
