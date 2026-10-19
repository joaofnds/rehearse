import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import type { CheckpointInputs } from "./checkpoint";
import {
	temporaryDirectory,
	writeFixtureFiles,
} from "./checkpoint-filesystem-test-fixture";
import type { Immutable } from "./contracts";
import type { TestResources } from "./test-support";

const DIGEST_QUARTET_REPETITIONS = 16;

async function checkpointFixture(
	testResources: Readonly<TestResources>,
): Promise<CheckpointFixture> {
	const directory = await temporaryDirectory(
		testResources,
		"rehearse-checkpoint-",
	);
	const targetDir = join(directory, "target");

	await writeWorkflow(targetDir);

	return {
		checkpointDir: join(directory, "checkpoint"),
		destination: join(directory, "materialized"),
		targetDir,
	};
}

async function writeWorkflow(targetDir: string): Promise<void> {
	await mkdir(join(targetDir, "backlog", "docs"), { recursive: true });
	await mkdir(join(targetDir, ".boris"), { recursive: true });
	await Bun.write(join(targetDir, "backlog", "config.yml"), "statuses: []\n");
	await Bun.write(
		join(targetDir, "backlog", "docs", "DOC-1 - spec.md"),
		"the spec\n",
	);
	await Bun.write(join(targetDir, ".boris", "CONTEXT.md"), "context\n");
	await mkdir(join(targetDir, "backlog", "drafts"), { recursive: true });
	await Bun.write(join(targetDir, "ignored.ts"), "not workflow state\n");
}

interface CheckpointFixture {
	readonly targetDir: string;
	readonly checkpointDir: string;
	readonly destination: string;
}

class CheckpointInputsBuilder {
	public constructor(
		private readonly props: Immutable<Partial<CheckpointInputs>> = {},
	) {}
	public build(): CheckpointInputs {
		return {
			artifacts: [
				{
					path: "backlog/docs/DOC-1 - spec.md",
					sha256: "bb22".repeat(DIGEST_QUARTET_REPETITIONS),
				},
			],
			corpusFiles: [
				{
					path: "CLAUDE.md",
					sha256: "aa11".repeat(DIGEST_QUARTET_REPETITIONS),
				},
			],
			effort: "high",
			model: "sonnet",
			stage: "discuss",
			targetSha: "task-sha",
			upstream: "root-key",
			...this.props,
		};
	}
}

interface CustomBoardFixture extends CheckpointFixture {
	readonly config: string;
}

async function customBoardCheckpointFixture(
	resources: Readonly<TestResources>,
): Promise<CustomBoardFixture> {
	const directory = await temporaryDirectory(resources, "rehearse-checkpoint-");
	const targetDir = join(directory, "target");
	const config = [
		'project_name: "Existing"',
		'statuses: ["To Do", "Done"]',
		'backlog_directory: "workflow-board"',
		"",
	].join("\n");

	await writeFixtureFiles({
		files: [
			["backlog.config.yml", config],
			["workflow-board/tasks/work-1.md", "the task\n"],
		],
		root: targetDir,
	});

	return {
		checkpointDir: join(directory, "checkpoint"),
		config,
		destination: join(directory, "materialized"),
		targetDir,
	};
}

export {
	CheckpointInputsBuilder,
	checkpointFixture,
	customBoardCheckpointFixture,
};

export type { CheckpointFixture };
