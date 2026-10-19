import type { CheckpointRecord } from "./checkpoint";
import type { RunManifest } from "./manifest";
import { TEST_TARGET } from "./test-support";

interface ReplayLineageFixture {
	readonly manifest: RunManifest;
	readonly checkpoints: ReadonlyMap<string, CheckpointRecord>;
}
interface BuiltReplayLineage extends Omit<ReplayLineageFixture, "checkpoints"> {
	readonly checkpoints: Map<string, CheckpointRecord>;
}
const DEFAULT_REPLAY_CHECKPOINTS: readonly CheckpointRecord[] = [
	{
		artifacts: [],
		corpusFiles: [],
		lineage: "lin-0",
		model: "sonnet",
		stage: "initial",
		targetSha: "task-sha",
		upstream: "root-key",
		workflowState: [],
	},
	{
		artifacts: [{ path: "backlog/docs/DOC-1 - spec.md", sha256: "aa" }],
		corpusFiles: [],
		lineage: "lin-1",
		model: "sonnet",
		stage: "discuss",
		targetSha: "task-sha",
		upstream: "lin-0",
		workflowState: [],
	},
	{
		artifacts: [{ path: "backlog/docs/DOC-2 - plan.md", sha256: "bb" }],
		corpusFiles: [],
		lineage: "lin-2",
		model: "sonnet",
		stage: "plan",
		targetSha: "task-sha",
		upstream: "lin-1",
		workflowState: [],
	},
];

class ReplayLineageFixtureBuilder {
	readonly #overrides: Partial<ReplayLineageFixture>;
	public constructor(overrides: Partial<ReplayLineageFixture> = {}) {
		this.#overrides = overrides;
	}
	public build(): BuiltReplayLineage {
		const checkpoints = new Map<string, CheckpointRecord>();
		for (const record of DEFAULT_REPLAY_CHECKPOINTS) {
			checkpoints.set(record.stage, record);
		}

		return {
			checkpoints: new Map(this.#overrides.checkpoints ?? checkpoints),
			manifest:
				this.#overrides.manifest ?? ReplayLineageFixtureBuilder.manifest(),
		};
	}
	private static manifest(): RunManifest {
		return {
			caseId: "audit-log",
			controlSha: "control-sha",
			judgeModel: "sonnet",
			model: "sonnet",
			pipeline: {
				stages: [
					{
						artifact: "spec",
						kind: "planning",
						name: "discuss",
						requiresAcceptanceCriteria: false,
						rubric: "rubrics/discuss.json",
						skill: "discuss",
					},
					{
						artifact: "plan",
						kind: "planning",
						name: "plan",
						requiresAcceptanceCriteria: true,
						rubric: "rubrics/plan.json",
						skill: "plan",
					},
					{
						kind: "delivery",
						name: "build",
						rubric: "rubrics/build.json",
						skill: "build",
					},
				],
				statuses: ["To Do", "Done"],
				target: TEST_TARGET,
			},
			pipelinePath: "pipelines/default.json",
			productBrief: "Brief text",
			sessionBudgetUsd: 5,
			sourceRoot: "/tmp/target",
			sourceSha: "source-sha",
			task: "Task text",
			taskId: "TASK-1",
			taskSha: "task-sha",
			timestamp: "2026-08-30T00:00:00.000Z",
		};
	}
}
export default ReplayLineageFixtureBuilder;
