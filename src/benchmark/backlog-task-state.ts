import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import { z } from "zod";

import { boardDirectory } from "./backlog-configuration";
import {
	readWorkflowText,
	workflowBoardPath,
	workflowEntryPath,
} from "./backlog-evidence-files";
import { runCommand } from "./command";
import { StageValidationError } from "./contracts";
import type { Immutable } from "./contracts";
import type { PlanningStageDefinition } from "./pipeline";

const DOCUMENT_ID_SPLIT_LIMIT = 1;
const EMPTY_COLLECTION_LENGTH = 0;

const taskViewFieldsSchema = z
	.object({
		acceptanceCriteria: z.array(z.unknown()),
		documentation: z.array(z.string()),
	})
	.loose();

const taskViewSchema = z
	.object({
		task: taskViewFieldsSchema,
	})
	.loose();

type TaskView = Immutable<z.infer<typeof taskViewSchema>>;

async function readTaskOutput(
	targetDir: string,
	taskId: string,
): Promise<string> {
	return await runCommand(["backlog", "task", taskId, "--json"], targetDir);
}

interface TaskState {
	readonly output: string;
	readonly view: TaskView;
}

/**
 * The card file is the task's full record: goal, decisions, glossary, and
 * prose sections that backlog's JSON projection omits. Judges read the card;
 * the JSON stays for structural validation.
 */
async function readTaskCard(
	targetDir: string,
	taskId: string,
): Promise<string> {
	const board = await workflowBoardPath({
		board: await boardDirectory(targetDir),
		targetDir,
	});
	const tasksDirectory = await workflowEntryPath({
		board,
		path: join(board, "tasks"),
	});
	const entries = await readdir(tasksDirectory);
	const prefix = `${taskId.toLowerCase()} -`;
	const cardFile = entries.find((entry) =>
		entry.toLowerCase().startsWith(prefix),
	);
	if (cardFile === undefined) {
		throw new StageValidationError(`No task card found for ${taskId}`);
	}

	return await readWorkflowText({
		board,
		path: join(tasksDirectory, cardFile),
	});
}

function parseTaskState(output: string): TaskState {
	try {
		return { output, view: taskViewSchema.parse(JSON.parse(output)) };
	} catch {
		throw new StageValidationError("Backlog returned invalid task state");
	}
}

function assertStageArtifactState(
	stage: PlanningStageDefinition,
	view: TaskView,
	documentFiles: readonly string[],
): string | undefined {
	if (
		stage.requiresAcceptanceCriteria &&
		view.task.acceptanceCriteria.length === EMPTY_COLLECTION_LENGTH
	) {
		throw new StageValidationError(
			`${stage.name} completed without acceptance criteria`,
		);
	}

	const expectedDoc = stage.artifact;
	if (expectedDoc === undefined) {
		return undefined;
	}

	const artifactFile = attachedArtifactFile({
		documentFiles,
		documentation: view.task.documentation,
		expectedDoc,
	});

	if (artifactFile === undefined) {
		throw new StageValidationError(
			`${stage.name} completed without its durable ${expectedDoc} document`,
		);
	}

	return artifactFile;
}

interface AttachedArtifactSearch {
	readonly documentation: readonly string[];
	readonly documentFiles: readonly string[];
	readonly expectedDoc: string;
}

function attachedArtifactFile({
	documentation,
	documentFiles,
	expectedDoc,
}: AttachedArtifactSearch): string | undefined {
	const attachedReferences = documentation.map((reference) =>
		basename(reference),
	);
	const attachedIds = new Set(
		attachedReferences.map((reference) => {
			const [documentId] = reference.split(" ", DOCUMENT_ID_SPLIT_LIMIT);
			return documentId;
		}),
	);

	return documentFiles.find((file) => {
		const [documentId] = file.split(" ", DOCUMENT_ID_SPLIT_LIMIT);
		return (
			(attachedReferences.includes(file) ||
				(documentId !== undefined && attachedIds.has(documentId))) &&
			file.toLowerCase().endsWith(`-${expectedDoc}.md`)
		);
	});
}

export {
	assertStageArtifactState,
	parseTaskState,
	readTaskCard,
	readTaskOutput,
};
export type { TaskState, TaskView };
