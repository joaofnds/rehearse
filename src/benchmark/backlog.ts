import { join, relative } from "node:path";

import { boardDirectory, configureBacklog } from "./backlog-configuration";
import {
	readWorkflowDocuments,
	readWorkflowText,
	workflowBoardPath,
} from "./backlog-evidence-files";
import { assertStageArtifactState } from "./backlog-task-state";
import type { TaskView } from "./backlog-task-state";
import excludeWorkflowState from "./backlog-workflow-excludes";
import { runCommand } from "./command";
import type { PlanningStageDefinition } from "./pipeline";
import type { ExpectedBranch } from "./target";
import {
	assertWorkflowBoardPrivate,
	capturePlanningAdvance,
	git,
} from "./target";

const TASK_HEADING_PREFIX = "# ";

interface TaskSeed {
	readonly title: string;
	readonly description: string;
}

function parseTaskSeed(task: string): TaskSeed {
	const [heading, ...body] = task.trim().split("\n");
	if (heading === undefined || !heading.startsWith("# ")) {
		throw new Error("backlog-seed.md must start with a level-one heading");
	}

	const description = body.join("\n").trim();
	if (!description) {
		throw new Error("backlog-seed.md needs a task description");
	}

	return {
		description,
		title: heading.slice(TASK_HEADING_PREFIX.length).trim(),
	};
}

/**
 * Seeds the target's board with the run's task and reports the commit the
 * stage's changes are measured from. It writes no commit of its own: the
 * board lives under the target's ignored workflow state, and the target's
 * project instructions are a property of the target, so a run that rewrote
 * them would grade the agent against a repository nobody has.
 */
async function seedTaskBoard(
	targetDir: string,
	task: string,
	statuses: readonly string[],
): Promise<{ taskId: string; taskSha: string }> {
	const [entryStatus] = statuses;
	if (entryStatus === undefined) {
		throw new Error("The pipeline must declare at least one board status");
	}

	await assertWorkflowBoardPrivate(targetDir);
	await configureBacklog(targetDir, statuses);
	await excludeWorkflowState(targetDir);
	const { title, description } = parseTaskSeed(task);
	const taskId = await createBoardTask(
		targetDir,
		{ description, title },
		entryStatus,
	);

	return { taskId, taskSha: await git(targetDir, "rev-parse", "HEAD") };
}

async function createBoardTask(
	targetDir: string,
	seed: Readonly<TaskSeed>,
	entryStatus: string,
): Promise<string> {
	const createdTask = await runCommand(
		[
			"backlog",
			"task",
			"create",
			seed.title,
			"--description",
			seed.description,
			"--type",
			"feature",
			"--status",
			entryStatus,
			"--plain",
		],
		targetDir,
	);
	const taskId = /Task (?<id>[A-Z]+-\d+)/u.exec(createdTask)?.groups?.["id"];
	if (taskId === undefined) {
		throw new Error("Backlog did not return the created task ID");
	}

	return taskId;
}

interface PlanningBaseline {
	readonly targetDir: string;
	readonly baselineSha: string;
}

interface PlanningStageCompletion {
	readonly stage: PlanningStageDefinition;
	readonly taskState: { readonly output: string; readonly view: TaskView };
	readonly expectedBranch?: ExpectedBranch | undefined;
}

async function assertPlanningStageCompleted(
	{ targetDir, baselineSha }: PlanningBaseline,
	{ stage, taskState, expectedBranch = "main" }: PlanningStageCompletion,
): Promise<{
	taskState: string;
	artifact: { path: string; content: string } | undefined;
	resultSha: string;
	diff: string;
	changedPaths: string[];
	commitSubjects?: string[] | undefined;
}> {
	const advance = await capturePlanningAdvance(
		targetDir,
		baselineSha,
		expectedBranch,
	);
	const { output, view } = taskState;
	const board = await boardDirectory(targetDir);
	const evidenceRoot = await workflowBoardPath({ board, targetDir });
	const documentFiles = await readWorkflowDocuments(evidenceRoot);
	const artifactFile = assertStageArtifactState(stage, view, documentFiles);
	if (artifactFile === undefined) {
		return { artifact: undefined, taskState: output, ...advance };
	}
	const artifactPath = join(relative(targetDir, board), "docs", artifactFile);

	return {
		artifact: {
			content: await readWorkflowText({
				board: evidenceRoot,
				path: join(targetDir, artifactPath),
			}),
			path: artifactPath,
		},
		taskState: output,
		...advance,
	};
}

export { assertPlanningStageCompleted, seedTaskBoard };
export {
	assertStageArtifactState,
	parseTaskState,
	readTaskCard,
	readTaskOutput,
} from "./backlog-task-state";
export type { TaskState } from "./backlog-task-state";
export type { PlanningBaseline, PlanningStageCompletion };
