import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { CheckpointRecord } from "./checkpoint";
import {
	hashWorkflowState,
	initialCheckpointInputs,
	recordCheckpoint,
} from "./checkpoint";
import type { CorpusRoot } from "./corpus-file";
import { writeRunManifest } from "./manifest";
import type { RunManifest } from "./manifest";
import ReplayCorpusBuilder from "./replay-confirmation-corpus-test-builder";
import { benchmarkRunPaths } from "./run-layout";
import { currentSha } from "./target";
import type { TestResources } from "./test-support";
import { TEST_TARGET } from "./test-support";

interface ReplayCheckpointOptions {
	readonly prefix: string;
	readonly effort: "high" | undefined;
	readonly judgeEffort: "high" | undefined;
}
interface ReplayCheckpointWorkspace {
	readonly corpusRoots: readonly [CorpusRoot, ...CorpusRoot[]];
	readonly initial: CheckpointRecord;
	readonly manifest: RunManifest;
	readonly paths: ReturnType<typeof benchmarkRunPaths>;
	readonly sourceRoot: string;
	readonly taskSha: string;
}
interface DirectoryTracker {
	readonly track: (directory: string) => void;
}
class ReplayCheckpointInputsBuilder {
	readonly #options: ReplayCheckpointOptions;
	public constructor(options: Partial<ReplayCheckpointOptions> = {}) {
		this.#options = {
			effort: options.effort,
			judgeEffort: options.judgeEffort,
			prefix: options.prefix ?? "rehearse-replay-cleanup-",
		};
	}
	public async fromRepository(
		resources: Pick<TestResources, "createRepository" | "track">,
	): Promise<ReplayCheckpointWorkspace> {
		const source = await resources.createRepository();
		return await this.build(resources, source.directory);
	}
	public async build(
		resources: DirectoryTracker,
		sourceRoot: string,
	): Promise<ReplayCheckpointWorkspace> {
		const parent = await mkdtemp(join(tmpdir(), this.#options.prefix));
		resources.track(parent);
		return await this.writeTo(parent, sourceRoot);
	}
	public async writeTo(
		parent: string,
		sourceRoot: string,
	): Promise<ReplayCheckpointWorkspace> {
		const taskSha = await currentSha(sourceRoot);
		await mkdir(join(sourceRoot, "backlog"), { recursive: true });
		await Bun.write(
			join(sourceRoot, "backlog", "config.yml"),
			"statuses: []\n",
		);
		const paths = benchmarkRunPaths(parent, "run");
		const initial = await this.initialCheckpoint(sourceRoot, paths, taskSha);
		const manifest = this.manifest(sourceRoot, taskSha);
		await writeRunManifest(paths.manifestFile, manifest);
		const corpusRoot = join(parent, "corpus");
		await new ReplayCorpusBuilder({
			files: [
				{ content: "frozen discuss\n", path: "skills/discuss/SKILL.md" },
				{ content: "frozen doctrine\n", path: "skills/doctrine/SKILL.md" },
			],
		}).writeTo(corpusRoot);

		return {
			corpusRoots: [{ kind: "directory", root: corpusRoot }],
			initial,
			manifest,
			paths,
			sourceRoot,
			taskSha,
		};
	}
	private async initialCheckpoint(
		sourceRoot: string,
		paths: ReturnType<typeof benchmarkRunPaths>,
		taskSha: string,
	): Promise<CheckpointRecord> {
		const options =
			this.#options.effort === undefined
				? { model: "sonnet" }
				: { effort: this.#options.effort, model: "sonnet" };
		return await recordCheckpoint(
			sourceRoot,
			paths.checkpointDirectory("initial"),
			initialCheckpointInputs(
				{
					productBrief: "Brief text",
					task: "Task text",
					taskSha,
					workflowFiles: await hashWorkflowState(sourceRoot),
				},
				options,
			),
		);
	}
	private manifest(sourceRoot: string, taskSha: string): RunManifest {
		return {
			caseId: "audit-log",
			controlSha: "run-control-sha",
			effort: this.#options.effort,
			judgeEffort: this.#options.judgeEffort,
			judgeModel: "opus",
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
				],
				statuses: ["To Do", "Done"],
				target: TEST_TARGET,
			},
			pipelinePath: "pipelines/default.json",
			productBrief: "Brief text",
			sessionBudgetUsd: 5,
			sourceRoot,
			sourceSha: taskSha,
			task: "Task text",
			taskId: "TASK-1",
			taskSha,
			timestamp: "2026-08-31T00:00:00.000Z",
		};
	}
}
export default ReplayCheckpointInputsBuilder;
export type { ReplayCheckpointWorkspace };
