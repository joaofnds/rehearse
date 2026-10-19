import { deriveBaselineCorpus } from "./baseline-corpus";
import type {
	ArmGroupRequest,
	ArmGroups,
	ExtendComparisonDependencies,
	ExtendComparisonRequest,
	ExtensionPlan,
	RecordedArm,
} from "./comparison-attempt-contract";
import { materializeCorpus, writeManifest } from "./comparison-attempt-storage";
import writeComparisonReport from "./comparison-command";
import planExtension from "./comparison-extension-plan";
import type { ComparisonArm } from "./comparison-record";

type ExtensionReplay = Omit<
	ArmGroupRequest,
	"corpusDirectory" | "role" | "withoutStageSkill"
>;

interface MaterializedArmRequest {
	readonly arm: RecordedArm;
	readonly files: ReadonlyMap<string, string>;
	readonly replay: ExtensionReplay;
	readonly role: ComparisonArm;
	readonly runsDirectory: string;
	readonly withoutStageSkill: boolean;
}

interface AddedGroupsRequest {
	readonly armA: RecordedArm;
	readonly armB: RecordedArm;
	readonly baselineFiles: ReadonlyMap<string, string>;
	readonly dependencies: ExtendComparisonDependencies;
	readonly replay: ExtensionReplay;
	readonly runsDirectory: string;
}

function extensionReplay(
	armA: RecordedArm,
	attemptsPerArm: number,
): ExtensionReplay {
	const { inputs } = armA.group;
	return {
		...armA.checkpoint,
		effort: inputs.effort,
		judgeEffort: inputs.judgeEffort,
		judgeModel: inputs.judgeModel,
		model: inputs.model,
		reps: attemptsPerArm,
		sessionBudgetUsd: inputs.sessionBudgetUsd,
	};
}

async function replayArm(
	request: MaterializedArmRequest,
	dependencies: ExtendComparisonDependencies,
): Promise<string> {
	const corpusDirectory = await materializeCorpus(
		request.runsDirectory,
		request.arm.corpusDigest,
		request.files,
	);

	return await dependencies.runArmGroup({
		...request.replay,
		corpusDirectory,
		role: request.role,
		withoutStageSkill: request.withoutStageSkill,
	});
}

async function extendComparison(
	request: ExtendComparisonRequest,
	dependencies: ExtendComparisonDependencies,
): Promise<{ readonly reportFile: string }> {
	const plan = await planExtension(request);
	await dependencies.approve(plan.cost);

	return await runExtension(request, plan, dependencies);
}

async function addedGroups(
	context: AddedGroupsRequest,
): Promise<Readonly<Record<ComparisonArm, string>>> {
	return {
		baseline: await replayArm(
			{
				arm: context.armA,
				files: context.armA.corpus,
				replay: context.replay,
				role: "baseline",
				runsDirectory: context.runsDirectory,
				withoutStageSkill: false,
			},
			context.dependencies,
		),
		candidate: await replayArm(
			{
				arm: context.armB,
				files: context.armB.corpus,
				replay: context.replay,
				role: "candidate",
				runsDirectory: context.runsDirectory,
				withoutStageSkill: false,
			},
			context.dependencies,
		),
		control: await replayArm(
			{
				arm: context.armA,
				files: context.baselineFiles,
				replay: context.replay,
				role: "control",
				runsDirectory: context.runsDirectory,
				withoutStageSkill: true,
			},
			context.dependencies,
		),
	};
}

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
	const replay = extensionReplay(armA, request.attemptsPerArm);

	const added = await addedGroups({
		armA,
		armB,
		baselineFiles: baseline.files,
		dependencies,
		replay,
		runsDirectory,
	});

	const arms: ArmGroups = {
		baseline: [...record.arms.baseline, added.baseline],
		candidate: [...record.arms.candidate, added.candidate],
		control: [...record.arms.control, added.control],
	};
	const reportFile = await writeComparisonReport({
		baselineRecord: { ...record, arms, extends: request.comparison },
		manifestPath: await writeManifest(runsDirectory, armA.group.caseId, arms),
		runsDirectory,
	});

	return { reportFile };
}

export { extendComparison as default };
