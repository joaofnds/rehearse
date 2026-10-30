import { join } from "node:path";

import { readPriorArtifacts } from "./replay";
import type { ReplayRepContext } from "./replay-confirmation-runtime";
import type {
	StageExecutionInputs,
	StageSessionEnvironment,
} from "./stage-session-contract";
import type { ServiceEnvironment } from "./target-services";
import { setupWithServices, startTargetServices } from "./target-services";

interface PreparedReplayStage {
	readonly baseSha: string;
	readonly environment: ServiceEnvironment;
	readonly priorArtifacts: StageExecutionInputs["priorArtifacts"];
	readonly baselineContext: StageSessionEnvironment["baselineContext"];
	readonly baselineHashes: StageSessionEnvironment["baselineHashes"];
	readonly productOwner: StageSessionEnvironment["productOwner"];
	readonly stageStart: number;
}
interface ReplayPreparationSnapshot {
	readonly operation: string | undefined;
	readonly worktreeCreated: boolean;
	readonly productOwner: StageSessionEnvironment["productOwner"] | undefined;
	readonly stageStart: number;
}
class ReplayStagePreparation {
	readonly #context: ReplayRepContext;
	#operation: string | undefined = "worktree creation";
	#worktreeCreated = false;
	#productOwner: StageSessionEnvironment["productOwner"] | undefined;
	#stageStart: number;
	public constructor(context: ReplayRepContext) {
		this.#context = context;
		this.#stageStart = context.repStart;
	}
	public async prepare(): Promise<PreparedReplayStage> {
		const {
			dependencies,
			request,
			paths: repPaths,
			runtime: { frozen, now },
			spendCeiling,
		} = this.#context;
		await this.createWorktree();
		const baseSha = await this.restoreCheckpoint();
		const environment = await this.setupEnvironment();
		const baseline = await this.captureBaseline();
		this.#productOwner = dependencies.createProductOwner({
			directory: join(repPaths.directory, "product-owner"),
			effort: request.effort,
			model: request.model,
			productBrief: frozen.manifest.productBrief,
			sessionBudgetUsd: request.sessionBudgetUsd,
			spendCeiling,
			task: frozen.manifest.task,
		});
		this.#stageStart = now();
		this.#operation = undefined;

		return {
			baseSha,
			environment,
			...baseline,
			productOwner: this.#productOwner,
			stageStart: this.#stageStart,
		};
	}
	public snapshot(): ReplayPreparationSnapshot {
		return {
			operation: this.#operation,
			productOwner: this.#productOwner,
			stageStart: this.#stageStart,
			worktreeCreated: this.#worktreeCreated,
		};
	}
	private async createWorktree(): Promise<void> {
		const {
			dependencies,
			plan,
			runtime: { frozen },
		} = this.#context;
		await dependencies.addWorktree(
			frozen.sourceRoot,
			frozen.plan.consumed.targetSha,
			plan.worktreePath,
		);
		this.#worktreeCreated = true;
	}
	private async restoreCheckpoint(): Promise<string> {
		const {
			dependencies,
			plan,
			runtime: { frozen },
		} = this.#context;
		this.#operation = "checkpoint materialization";
		await dependencies.materializeCheckpoint(
			frozen.checkpointDirectory,
			plan.worktreePath,
		);
		this.#operation = "base commit reading";
		const baseSha = await dependencies.currentSha(plan.worktreePath);
		this.#operation = "corpus installation";
		await dependencies.installStageCorpusSnapshot(
			frozen.corpusDirectory,
			plan.worktreePath,
			frozen.citations,
		);

		return baseSha;
	}
	private async setupEnvironment(): Promise<ServiceEnvironment> {
		const {
			services,
			dependencies,
			plan,
			runtime: { frozen },
		} = this.#context;
		if (frozen.plan.definition.kind !== "delivery") {
			return {};
		}

		this.#operation = "service start";
		const environment = await startTargetServices(
			services,
			frozen.manifest.pipeline.target,
		);
		this.#operation = "target setup";
		await dependencies.runSetup(
			plan.worktreePath,
			setupWithServices(frozen.manifest.pipeline.target.setup, environment),
			dependencies.log,
		);

		return environment;
	}
	private async captureBaseline(): Promise<
		Pick<
			PreparedReplayStage,
			"priorArtifacts" | "baselineHashes" | "baselineContext"
		>
	> {
		const {
			dependencies,
			plan,
			runtime: { frozen },
		} = this.#context;
		this.#operation = "prior-artifact reading";
		const priorArtifacts = await readPriorArtifacts(
			plan.worktreePath,
			frozen.plan.priorArtifacts,
		);
		this.#operation = "baseline hash capture";
		const baselineHashes = await dependencies.captureFileHashes(
			plan.worktreePath,
			frozen.manifest.pipeline.target.integrityFiles,
		);
		this.#operation = "baseline-context capture";
		const baselineContext = await dependencies.captureBaselineContext(
			plan.worktreePath,
		);

		return { baselineContext, baselineHashes, priorArtifacts };
	}
}
export default ReplayStagePreparation;
export type { PreparedReplayStage, ReplayPreparationSnapshot };
