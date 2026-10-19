import type { RunManifest } from "./manifest";
import type { ReplayDependencies } from "./replay";
import ReplayConfirmationHarness from "./replay-confirmation-test-support";
import { REAL_REPLAY_WORKTREES } from "./replay-confirmation-worktree-test-fixtures";
import ReplayRepositoryStage from "./replay-repository-stage-test-fixture";
import { repositoryHolding } from "./run-repositories";
import { loadStageRubric } from "./stage-rubric";
import { pruneWorktrees } from "./target";
import { targetServices } from "./target-services";
import {
	FakeContainerRuntime,
	READY_AT_ONCE,
} from "./target-services-test-support";

const FIRST_RECORDED_STAGE_INDEX = 0;
class ReplayRepositoryProvider extends ReplayConfirmationHarness {
	readonly #manifest: RunManifest;
	public readonly heldStops = new Set<() => Promise<void>>();
	public constructor(manifest: RunManifest) {
		super();
		this.#manifest = manifest;
	}
	private readonly judge: ReplayDependencies["runStageJudge"] = async (
		_execution,
		{ input },
	) => {
		this.judged.push(input);

		const loaded = await loadStageRubric(
			this.#manifest.pipeline.stages[FIRST_RECORDED_STAGE_INDEX] ?? {
				artifact: "spec",
				kind: "planning",
				name: "discuss",
				requiresAcceptanceCriteria: false,
				rubric: "rubrics/shape.json",
				skill: "discuss",
			},
		);

		return {
			attempts: [],
			costUsd: 0.4,
			grade: {
				dimensions: [],
				grade: "A",
				hardBlockers: [],
				requirements: [],
				summary: "graded",
				verdict: "CONTINUE",
			},
			input,
			prompt: "prompt",
			rubric: loaded.rubric,
			rubricPath: "rubrics/discuss.json",
			stage: input.stage,
		};
	};
	public readonly repositoryDependencies: ReplayDependencies = {
		...this.dependencies,
		...REAL_REPLAY_WORKTREES,
		installStageCorpusSnapshot: async () => {
			await Promise.reject(new Error("no corpus source"));
		},
		loadStageRubric,
		log: (message) => {
			this.log.push(message);
		},
		pruneWorktrees,
		replaySourceRoot: repositoryHolding,
		runSetup: async () => {
			await Promise.reject(new Error("not a delivery stage"));
		},
		runStageJudge: this.judge,
		services: (owner) =>
			targetServices(owner, new FakeContainerRuntime(), READY_AT_ONCE),
		stageSession: new ReplayRepositoryStage().dependencies,
		stopOnSignal: (cleanUp) => {
			this.heldStops.add(cleanUp);
			return () => {
				this.heldStops.delete(cleanUp);
			};
		},
	};
}
export default ReplayRepositoryProvider;
