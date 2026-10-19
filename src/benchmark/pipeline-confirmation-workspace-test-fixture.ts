import { mkdir, mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
	installStageCorpusSnapshot,
	materializeCheckpoint,
	recordCheckpoint,
} from "./checkpoint";
import { captureBaselineContext, captureFileHashes } from "./checks";
import { runCommand } from "./command";
import type { PipelineConfirmationDependencies } from "./pipeline-confirmation";
import { addWorktree, captureBuildCandidate, currentSha } from "./target";
import { createProductOwner } from "./workflow";

interface ConfirmationResources {
	readonly track: (directory: string) => void;
	readonly trackWorktree: (repositoryRoot: string, path: string) => void;
	readonly createRepository: () => Promise<{
		readonly directory: string;
		readonly sha: string;
	}>;
}

interface PipelineHarnessProps {
	readonly sourceRoot: string;
	readonly sourceSha: string;
	readonly runsDirectory: string;
	readonly corpusRoot: string;
}

async function createPipelineHarnessResources(
	resources: ConfirmationResources,
): Promise<PipelineHarnessProps> {
	const source = await resources.createRepository();
	const sourceHead = await runCommand(
		["git", "rev-parse", "HEAD"],
		source.directory,
	);

	const runsDirectory = await mkdtemp(
		join(tmpdir(), "rehearse-pipeline-confirmation-"),
	);
	resources.track(runsDirectory);

	const corpusRoot = join(runsDirectory, "corpus");
	await Array.fromAsync(["discuss", "build", "doctrine"], async (skill) => {
		await mkdir(join(corpusRoot, "skills", skill), { recursive: true });
		await Bun.write(
			join(corpusRoot, "skills", skill, "SKILL.md"),
			`${skill} corpus\n`,
		);
	});

	return {
		corpusRoot,
		runsDirectory,
		sourceRoot: source.directory,
		sourceSha: sourceHead.trim(),
	};
}

type WorkspaceDefaults = Pick<
	PipelineConfirmationDependencies,
	| "addWorktree"
	| "captureBaselineContext"
	| "captureBuildCandidate"
	| "captureFileHashes"
	| "createProductOwner"
	| "installStageCorpusSnapshot"
	| "materializeCheckpoint"
	| "recordCheckpoint"
	| "runChecks"
	| "runSetup"
	| "seedTaskBoard"
>;

function worktreeCreator(
	resources: ConfirmationResources,
): PipelineConfirmationDependencies["addWorktree"] {
	const directories = new Set<string>();

	return async (root, sha, path) => {
		const directory = dirname(path);
		if (!directories.has(directory)) {
			resources.track(directory);
			directories.add(directory);
		}

		await addWorktree(root, sha, path);
		resources.trackWorktree(root, path);
	};
}
function workspaceDependencies(
	resources: ConfirmationResources,
): WorkspaceDefaults {
	return {
		addWorktree: worktreeCreator(resources),
		captureBaselineContext,
		captureBuildCandidate,
		captureFileHashes,
		createProductOwner,
		installStageCorpusSnapshot,
		materializeCheckpoint,
		recordCheckpoint,
		runChecks: async () => {
			await Promise.resolve();
		},
		runSetup: async () => {
			await Promise.resolve();
		},
		seedTaskBoard: async (targetDir: string) => ({
			taskId: "TASK-1",
			taskSha: await currentSha(targetDir),
		}),
	};
}
function repOrdinal(targetDirectory: string): number {
	const match = /-rep-(?<ordinal>\d+)$/u.exec(targetDirectory);
	return Number(match?.groups?.["ordinal"]);
}

async function remainingConfirmationRoots(
	groupId: string,
): Promise<readonly string[]> {
	const entries = await readdir(tmpdir());
	return entries.filter((entry) => entry.startsWith(`rehearse-${groupId}-`));
}

export {
	createPipelineHarnessResources,
	remainingConfirmationRoots,
	repOrdinal,
	workspaceDependencies,
};
export type { ConfirmationResources, PipelineHarnessProps };
