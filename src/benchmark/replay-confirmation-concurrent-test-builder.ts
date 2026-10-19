import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCommand } from "./command";
import type { ReplayCheckpointWorkspace } from "./replay-confirmation-checkpoint-test-builder";
import ReplayCheckpointInputsBuilder from "./replay-confirmation-checkpoint-test-builder";
import type { loadStageRubric } from "./stage-rubric";
import { commitAll } from "./test-support";
import type { TestResources } from "./test-support";
import type { WorkflowStageRequest } from "./workflow-contract";

const FROZEN_REPLAY_RUBRIC = {
	content: '{"frozen":true}\n',
	rubric: {
		dimensions: [
			{ description: "Clear", excellent: "e", good: "g", id: "clarity" },
		],
		hardBlockers: [],
		requirements: [{ description: "Scope is explicit", id: "scope" }],
	},
	rubricPath: "rubrics/discuss.json",
} satisfies Awaited<ReturnType<typeof loadStageRubric>>;
class ReplayConcurrentWorkspaceBuilder {
	readonly #prefix: string;
	public constructor(options: Partial<{ readonly prefix: string }> = {}) {
		this.#prefix = options.prefix ?? "rehearse-confirmed-replay-";
	}
	public async build(
		resources: Pick<TestResources, "track">,
	): Promise<ReplayCheckpointWorkspace> {
		const parent = await mkdtemp(join(tmpdir(), this.#prefix));
		resources.track(parent);
		const primary = join(parent, "primary");
		await ReplayConcurrentWorkspaceBuilder.initialize(primary);
		return await new ReplayCheckpointInputsBuilder({
			effort: "high",
			judgeEffort: "high",
		}).writeTo(parent, primary);
	}
	private static async initialize(primary: string): Promise<void> {
		await mkdir(primary);
		await runCommand(["git", "init", "-b", "main"], primary);
		await runCommand(["git", "config", "user.name", "Benchmark Test"], primary);
		await runCommand(
			["git", "config", "user.email", "benchmark@example.com"],
			primary,
		);
		await Bun.write(
			join(primary, ".gitignore"),
			"backlog/\n.boris/\n.claude/\nnode_modules/\n",
		);
		await Bun.write(join(primary, "base.txt"), "base\n");
		await commitAll(primary, "chore: base");
	}
}
interface PrimaryState {
	readonly base: Uint8Array;
	readonly branch: string;
	readonly head: string;
	readonly status: string;
}
interface ConsumedReplayInput {
	readonly branch: string;
	readonly budget: number;
	readonly checkpoint: string;
	readonly effort: string | undefined;
	readonly instructions: string;
	readonly model: string;
	rubric: string;
	readonly skill: string;
	readonly targetDir: string;
}
async function readPrimaryState(primary: string): Promise<PrimaryState> {
	return {
		base: await Bun.file(join(primary, "base.txt")).bytes(),
		branch: await runCommand(["git", "branch", "--show-current"], primary),
		head: await runCommand(["git", "rev-parse", "HEAD"], primary),
		status: await runCommand(["git", "status", "--porcelain"], primary),
	};
}
async function readConsumedReplayInput(
	workflowRequest: WorkflowStageRequest,
): Promise<ConsumedReplayInput> {
	return {
		branch: await runCommand(
			["git", "branch", "--show-current"],
			workflowRequest.targetDir,
		),
		budget: workflowRequest.sessionBudgetUsd,
		checkpoint: await Bun.file(
			join(workflowRequest.targetDir, "backlog", "config.yml"),
		).text(),
		effort: workflowRequest.effort,
		instructions: await Bun.file(
			join(workflowRequest.targetDir, ".claude", "CLAUDE.md"),
		).text(),
		model: workflowRequest.model,
		rubric: "",
		skill: await Bun.file(
			join(
				workflowRequest.targetDir,
				".claude",
				"skills",
				"discuss",
				"SKILL.md",
			),
		).text(),
		targetDir: workflowRequest.targetDir,
	};
}
export {
	ReplayConcurrentWorkspaceBuilder as default,
	FROZEN_REPLAY_RUBRIC,
	readPrimaryState,
	readConsumedReplayInput,
};
