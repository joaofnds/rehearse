import {
	deriveStaleness,
	freezeStageSnapshot,
	stageCorpusRoots,
} from "./checkpoint";
import type { Immutable } from "./contracts";
import type { CorpusRoot } from "./corpus-file";
import type { ReplayExecutionContext } from "./replay-contract";
import { currentChainCorpus, readPriorArtifacts } from "./replay-corpus";
import { createSpendCeiling } from "./spend-ceiling";
import type {
	StageExecutionInputs,
	StageSessionEnvironment,
} from "./stage-session-contract";
import { chainRubricCauses } from "./staleness-report";
import type { ServiceEnvironment } from "./target-services";
import { setupWithServices, startTargetServices } from "./target-services";

const EMPTY_COLLECTION_LENGTH = 0;
type PreparedSession = Pick<
	StageSessionEnvironment,
	"baselineContext" | "baselineHashes" | "productOwner" | "spendCeiling"
>;
interface PreparedReplayStage extends PreparedSession {
	readonly baselineSha: string;
	readonly corpusRoots: StageSessionEnvironment["corpusRoots"];
	readonly environment: ServiceEnvironment;
	readonly priorArtifacts: StageExecutionInputs["priorArtifacts"];
	readonly staleness: Immutable<ReturnType<typeof deriveStaleness>>;
	readonly now: () => number;
	readonly stageStartedAtMs: number;
}
class ReplayPreparation {
	readonly #context: ReplayExecutionContext;
	public constructor(context: ReplayExecutionContext) {
		this.#context = context;
	}
	public async run(): Promise<PreparedReplayStage> {
		const restored = await this.restore();
		const environment = await this.startServices();
		const priorArtifacts = await readPriorArtifacts(
			this.#context.lifetime.worktreeDir,
			this.#context.inputs.plan.priorArtifacts,
		);
		const { source, ...installed } = restored;
		const staleness = await this.staleness(installed.corpusRoots, source);
		const session = await this.session();

		return { ...installed, ...session, environment, priorArtifacts, staleness };
	}
	/** Restores the checkpoint and installs the corpus the stage reads. */
	private async restore(): Promise<
		Pick<PreparedReplayStage, "corpusRoots" | "baselineSha"> & {
			readonly source: CorpusRoot;
		}
	> {
		const {
			dependencies,
			request,
			inputs: { plan },
			lifetime: { worktreeDir },
		} = this.#context;
		await dependencies.materializeCheckpoint(
			request.paths.checkpointDirectory(plan.consumed.stage),
			worktreeDir,
		);
		const source = await this.frozenSource();
		if (source.kind === "directory") {
			await dependencies.installCorpusDirectory(
				source.root,
				worktreeDir,
				await dependencies.liveCitations(),
			);
		}
		const corpusRoots = stageCorpusRoots(source, worktreeDir);
		const baselineSha = await dependencies.currentSha(worktreeDir);

		return { baselineSha, corpusRoots, source };
	}
	/**
	 * A corpus directory stays editable while the replay sets up and runs, so
	 * the replay installs and judges a copy taken before setup.
	 */
	private async frozenSource(): Promise<CorpusRoot> {
		const {
			request: { corpusSource },
			lifetime: { corpusDirectory },
		} = this.#context;
		if (corpusSource.kind !== "directory") {
			return corpusSource;
		}
		await freezeStageSnapshot(corpusSource.root, corpusDirectory);

		return { kind: "directory", root: corpusDirectory };
	}
	private async startServices(): Promise<ServiceEnvironment> {
		const {
			dependencies,
			inputs: { plan, manifest },
			lifetime: { worktreeDir, services },
		} = this.#context;
		let environment: ServiceEnvironment = {};
		if (plan.definition.kind === "delivery") {
			environment = await startTargetServices(
				services,
				manifest.pipeline.target,
			);
			await dependencies.runSetup(
				worktreeDir,
				setupWithServices(manifest.pipeline.target.setup, environment),
				dependencies.log,
			);
		}

		return environment;
	}
	private async staleness(
		corpusRoots: PreparedReplayStage["corpusRoots"],
		source: CorpusRoot,
	): Promise<PreparedReplayStage["staleness"]> {
		const {
			dependencies,
			request,
			inputs: { manifest, plan },
		} = this.#context;
		const staleness = deriveStaleness(
			plan.chain,
			await currentChainCorpus(
				{ manifest, plan },
				{
					instructions: request.instructions,
					roots: corpusRoots,
					source,
				},
				dependencies.stageSession.captureStageCorpus,
			),
			{
				effort: request.effort,
				judgeRubricCauses: await chainRubricCauses(
					plan.chain,
					manifest.pipeline.stages,
				),
				model: request.model,
				settingsFile: request.loadedSettings?.hashed,
			},
		).filter(({ stale }) => stale);
		if (staleness.length === EMPTY_COLLECTION_LENGTH) {
			dependencies.log("Checkpoint chain is fresh");
		}
		for (const { stage, causes } of staleness) {
			dependencies.log(`Stale checkpoint ${stage}: ${causes.join("; ")}`);
		}

		return staleness;
	}
	private async session(): Promise<
		PreparedSession & Pick<PreparedReplayStage, "now" | "stageStartedAtMs">
	> {
		const {
			dependencies,
			request,
			inputs: { manifest },
			lifetime: { worktreeDir, productOwnerDirectory },
		} = this.#context;
		const baselineHashes = await dependencies.captureFileHashes(
			worktreeDir,
			manifest.pipeline.target.integrityFiles,
		);
		const baselineContext =
			await dependencies.captureBaselineContext(worktreeDir);
		const spendCeiling = createSpendCeiling({
			ceilingUsd: request.spendCeilingUsd,
		});
		const productOwner = dependencies.createProductOwner({
			directory: productOwnerDirectory,
			effort: request.effort,
			model: request.model,
			productBrief: manifest.productBrief,
			sessionBudgetUsd: request.sessionBudgetUsd,
			spendCeiling,
			task: manifest.task,
		});
		const now = dependencies.now ?? (() => performance.now());
		const stageStartedAtMs = now();

		return {
			baselineContext,
			baselineHashes,
			now,
			productOwner,
			spendCeiling,
			stageStartedAtMs,
		};
	}
}
export { ReplayPreparation as default };
export type { PreparedReplayStage };
