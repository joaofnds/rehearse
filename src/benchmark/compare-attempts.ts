import { basename } from "node:path";

import recordedArm from "./comparison-arm-records";
import type {
	ArmGroups,
	CompareAttemptsDependencies,
	CompareAttemptsRequest,
	ComparisonPlan,
} from "./comparison-attempt-contract";
import {
	assertComparableArms,
	materializeCorpus,
	writeManifest,
} from "./comparison-attempt-storage";
import {
	assertBaselineGradesOnArmARubric,
	assertStageReadsSkillUnderTest,
	describeCheckpoint,
	requiredComparisonBaseline,
} from "./comparison-baseline-eligibility";
import writeComparisonReport from "./comparison-command";
import { RefusedPreconditionError } from "./exit-codes";

async function planComparison(
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
	const baseline = requiredComparisonBaseline(armA.corpus, armB.corpus);
	assertStageReadsSkillUnderTest(armA, armB, baseline.skillUnderTest);
	await assertBaselineGradesOnArmARubric(
		request.runsDirectory,
		armA,
		baseline.skillUnderTest,
	);

	return { armA, baseline };
}

async function compareAttempts(
	request: CompareAttemptsRequest,
	dependencies: CompareAttemptsDependencies,
): Promise<{ readonly reportFile: string }> {
	return await runComparison(
		request,
		await planComparison(request),
		dependencies,
	);
}

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
		effort: inputs.effort,
		judgeEffort: inputs.judgeEffort,
		judgeModel: inputs.judgeModel,
		model: inputs.model,
		reps: armA.group.reps,
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
		baselineRecord: {
			arms,
			controlCorpus: basename(corpusDirectory),
			kind: baseline.kind,
			schemaVersion: 3,
			skillUnderTest: baseline.skillUnderTest,
		},
		manifestPath,
		notice: dependencies.notice,
		runsDirectory: request.runsDirectory,
	});

	return { reportFile };
}

export { default as recordedArm } from "./comparison-arm-records";
export type {
	ArmGroupRequest,
	Checkpoint,
	CompareAttemptsDependencies,
	CompareAttemptsRequest,
	ComparisonPlan,
	ExtendComparisonDependencies,
	ExtendComparisonRequest,
	ExtensionPlan,
	RecordedArm,
} from "./comparison-attempt-contract";
export { default as extendComparison } from "./comparison-extension";
export { default as planExtension } from "./comparison-extension-plan";
export { compareAttempts, planComparison };
