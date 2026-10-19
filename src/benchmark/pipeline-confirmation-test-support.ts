import type {
	PipelineConfirmationDependencies,
	PipelineConfirmationRequest,
} from "./pipeline-confirmation";
import runPipelineConfirmation from "./pipeline-confirmation";
import {
	completeFinalJudgment,
	pipelineStageScorecard,
} from "./pipeline-confirmation-judging-test-fixtures";
import PipelineConfirmationRequestBuilder from "./pipeline-confirmation-request-builder";
import stageSessionDefaults from "./pipeline-confirmation-stage-test-adapter";
import type {
	ConfirmationResources,
	PipelineHarnessProps,
} from "./pipeline-confirmation-workspace-test-fixture";
import {
	createPipelineHarnessResources,
	workspaceDependencies,
} from "./pipeline-confirmation-workspace-test-fixture";
import { removeWorktree } from "./target";
import { targetServices } from "./target-services";
import {
	FakeContainerRuntime,
	READY_AT_ONCE,
} from "./target-services-test-support";

type PipelineDependencyOverride = (
	defaults: PipelineConfirmationDependencies,
) => PipelineConfirmationDependencies;

interface PipelineHarnessContext extends PipelineHarnessProps {
	readonly resources: ConfirmationResources;
}

class PipelineConfirmationHarness {
	private readonly resources: ConfirmationResources;
	public readonly sourceRoot: string;
	public readonly sourceSha: string;
	public readonly runsDirectory: string;
	public readonly corpusRoot: string;
	public readonly retained = new Map<string, string>();
	public readonly removed: string[] = [];
	public readonly stops: (() => Promise<void>)[] = [];
	public readonly pruned: string[] = [];
	public readonly logs: string[] = [];
	public readonly containers = new FakeContainerRuntime();

	private constructor(props: PipelineHarnessContext) {
		this.resources = props.resources;
		this.sourceRoot = props.sourceRoot;
		this.sourceSha = props.sourceSha;
		this.runsDirectory = props.runsDirectory;
		this.corpusRoot = props.corpusRoot;
	}

	public static async setup(
		resources: ConfirmationResources,
	): Promise<PipelineConfirmationHarness> {
		const props = await createPipelineHarnessResources(resources);
		return new PipelineConfirmationHarness({ ...props, resources });
	}

	public async run(
		requestOverrides: Partial<PipelineConfirmationRequest>,
		...overrides: readonly PipelineDependencyOverride[]
	): ReturnType<typeof runPipelineConfirmation> {
		let dependencies = this.defaultDependencies();
		for (const override of overrides) {
			dependencies = override(dependencies);
		}

		const request = new PipelineConfirmationRequestBuilder({
			corpusRoots: [{ kind: "directory", root: this.corpusRoot }],
			runsDirectory: this.runsDirectory,
			source: { root: this.sourceRoot, sha: this.sourceSha },
			...requestOverrides,
		}).build();

		return await runPipelineConfirmation(dependencies, request);
	}

	private defaultDependencies(): PipelineConfirmationDependencies {
		return {
			...workspaceDependencies(this.resources),
			log: (message) => {
				this.logs.push(message);
			},
			pruneWorktrees: async (root) => {
				this.pruned.push(root);

				await Promise.resolve();
			},
			recordRetentionRef: async (_targetRoot, runName, targetSha) => {
				this.retained.set(runName, targetSha);

				await Promise.resolve();
			},
			removeWorktree: async (targetRoot, worktreePath) => {
				this.removed.push(worktreePath);
				await removeWorktree(targetRoot, worktreePath);
			},
			runFinalJudge: async () => await Promise.resolve(completeFinalJudgment()),
			runStageJudge: async (_execution, { input, source }) =>
				await Promise.resolve(pipelineStageScorecard(input, source)),
			services: (owner) =>
				targetServices(owner, this.containers, READY_AT_ONCE),
			stageSession: stageSessionDefaults(),
			stopOnSignal: (cleanUp, recordStop) =>
				this.registerStop({ cleanUp, recordStop }),
		};
	}

	private registerStop({ cleanUp, recordStop }: StopRegistration): () => void {
		let released = false;

		this.stops.push(async () => {
			if (released) {
				return;
			}

			await recordStop?.("SIGTERM");
			await cleanUp();
		});

		return () => {
			released = true;
		};
	}
}

interface StopRegistration {
	readonly cleanUp: () => Promise<void>;
	readonly recordStop: (signal: NodeJS.Signals) => Promise<void>;
}

export { PipelineConfirmationHarness };
export type { PipelineDependencyOverride };
export {
	CONFIRMATION_PIPELINE,
	SERVED_CONFIRMATION_PIPELINE,
} from "./pipeline-confirmation-test-data";
export {
	CONFIRMATION_METRIC,
	CONFIRMATION_STAGE_RUBRIC,
	completeFinalGrade,
	pipelineStageScorecard,
} from "./pipeline-confirmation-judging-test-fixtures";
