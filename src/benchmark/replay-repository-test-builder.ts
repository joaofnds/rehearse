import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	hashWorkflowState,
	initialCheckpointInputs,
	recordCheckpoint,
} from "./checkpoint";
import { runCommand } from "./command";
import type { RunManifest } from "./manifest";
import { writeRunManifest } from "./manifest";
import { benchmarkRunPaths } from "./run-layout";
import { currentSha } from "./target";
import type { TestResources } from "./test-support";
import { AUDIT_LOG_RUBRICS_PATH, TEST_TARGET, commitAll } from "./test-support";

interface ReplayRepositoryOptions {
	readonly prefix: string;
}
class ReplayRepositoryBuilder {
	readonly #prefix: string;
	public constructor(options: Partial<ReplayRepositoryOptions> = {}) {
		this.#prefix = options.prefix ?? "rehearse-real-replay-";
	}
	public async build(resources: Pick<TestResources, "track">): Promise<{
		readonly parent: string;
		readonly primary: string;
		readonly taskSha: string;
		readonly paths: ReturnType<typeof benchmarkRunPaths>;
		readonly manifest: RunManifest;
	}> {
		const parent = await mkdtemp(join(tmpdir(), this.#prefix));
		resources.track(parent);
		const primary = join(parent, "primary");
		await ReplayRepositoryBuilder.initialize(primary);
		const taskSha = await currentSha(primary);
		const paths = benchmarkRunPaths(parent, "run");
		await ReplayRepositoryBuilder.checkpoint(primary, paths, taskSha);
		const manifest = ReplayRepositoryBuilder.manifest(primary, taskSha);
		await writeRunManifest(paths.manifestFile, manifest);

		return { manifest, parent, paths, primary, taskSha };
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
			"backlog/\n.boris/\nnode_modules/\n",
		);
		await Bun.write(join(primary, "base.txt"), "base\n");
		await commitAll(primary, "chore: base");
	}
	private static async checkpoint(
		primary: string,
		paths: ReturnType<typeof benchmarkRunPaths>,
		taskSha: string,
	): Promise<void> {
		await mkdir(join(primary, "backlog", "docs"), { recursive: true });
		await Bun.write(join(primary, "backlog", "config.yml"), "statuses: []\n");
		await recordCheckpoint(
			primary,
			paths.checkpointDirectory("initial"),
			initialCheckpointInputs(
				{
					productBrief: "Brief text",
					task: "Task text",
					taskSha,
					workflowFiles: await hashWorkflowState(primary),
				},
				{ model: "sonnet" },
			),
		);
	}
	private static manifest(primary: string, taskSha: string): RunManifest {
		return {
			caseId: "audit-log",
			controlSha: "run-control-sha",
			judgeModel: "sonnet",
			model: "sonnet",
			pipeline: {
				stages: [
					{
						artifact: "spec",
						kind: "planning",
						name: "discuss",
						requiresAcceptanceCriteria: false,
						rubric: `${AUDIT_LOG_RUBRICS_PATH}/shape.json`,
						skill: "discuss",
					},
					{
						kind: "delivery",
						name: "build",
						rubric: `${AUDIT_LOG_RUBRICS_PATH}/build.json`,
						skill: "build",
					},
				],
				statuses: ["To Do", "Done"],
				target: TEST_TARGET,
			},
			pipelinePath: "pipelines/default.json",
			productBrief: "Brief text",
			sessionBudgetUsd: 5,
			sourceRoot: primary,
			sourceSha: taskSha,
			task: "Task text",
			taskId: "TASK-1",
			taskSha,
			timestamp: "2026-08-30T00:00:00.000Z",
		};
	}
}

async function readReplayRepositoryState(primary: string): Promise<{
	readonly branch: string;
	readonly head: string;
	readonly status: string;
}> {
	return {
		branch: await runCommand(["git", "branch", "--show-current"], primary),
		head: await runCommand(["git", "rev-parse", "HEAD"], primary),
		status: await runCommand(["git", "status", "--porcelain"], primary),
	};
}
export { readReplayRepositoryState };

export default ReplayRepositoryBuilder;
