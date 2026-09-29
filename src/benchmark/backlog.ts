import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import {
	BacklogConfigurationError,
	existingBacklogLayout,
} from "./backlog-layout";
import { runCommand } from "./command";
import { StageValidationError } from "./contracts";
import { RefusedPreconditionError } from "./exit-codes";
import type { PlanningStageDefinition } from "./pipeline";
import type { ExpectedBranch } from "./target";
import {
	assertWorkflowBoardPrivate,
	capturePlanningAdvance,
	git,
} from "./target";
import { managedWorkflowPaths } from "./workflow-state";
import type { Immutable } from "./contracts";

const taskViewSchema = z
	.object({
		task: z
			.object({
				acceptanceCriteria: z.array(z.unknown()),
				documentation: z.array(z.string()),
			})
			.loose(),
	})
	.loose();

type TaskView = Immutable<z.infer<typeof taskViewSchema>>;

const GITIGNORE_SPECIAL_CHARACTERS = new Set(["\\", "*", "?", "[", "]"]);

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

	return { title: heading.slice(2).trim(), description };
}

async function boardDirectory(targetDir: string): Promise<string> {
	const layout = await existingBacklogLayout(targetDir);
	return layout?.directory ?? join(targetDir, "backlog");
}

/**
 * The harness owns its board scaffolding but not the target's `.gitignore`.
 * Repository-private excludes keep a previously boardless target clean without
 * changing the files a stage is measured against or depending on global Git
 * configuration.
 */
async function excludeWorkflowState(targetDir: string): Promise<void> {
	const commonDirectory = await git(targetDir, "rev-parse", "--git-common-dir");
	const excludePath = resolve(targetDir, commonDirectory, "info", "exclude");
	let existing: string;
	try {
		existing = await readFile(excludePath, "utf8");
	} catch (error) {
		if (
			!(error instanceof Error && "code" in error && error.code === "ENOENT")
		) {
			throw error;
		}
		existing = "";
	}
	const paths = await managedWorkflowPaths(targetDir);
	const patterns = [
		...new Set(
			paths.map((path) => {
				const normalized = path.split(sep).join("/");
				if (normalized.includes("\n") || normalized.includes("\r")) {
					throw new Error("Backlog directory must fit on one Git exclude line");
				}
				let escaped = "";
				for (const character of normalized) {
					if (GITIGNORE_SPECIAL_CHARACTERS.has(character)) {
						escaped += "\\";
					}
					escaped += character;
				}
				return `/${escaped}${normalized === "backlog.config.yml" ? "" : "/"}`;
			}),
		),
	];
	const lines = new Set(
		existing.split("\n").map((line) => line.replace(/\r$/u, "")),
	);
	const missing = patterns.filter((path) => !lines.has(path));
	if (missing.length === 0) {
		return;
	}

	await mkdir(dirname(excludePath), { recursive: true });
	const separator = existing === "" || existing.endsWith("\n") ? "" : "\n";
	await Bun.write(
		excludePath,
		`${existing}${separator}${missing.join("\n")}\n`,
	);
}

async function configureBacklog(
	targetDir: string,
	statuses: readonly string[],
): Promise<void> {
	let layout = await existingBacklogLayout(targetDir);
	if (layout === undefined) {
		await runCommand(
			[
				"backlog",
				"init",
				"Template",
				"--defaults",
				"--integration-mode",
				"cli",
				"--agent-instructions",
				"none",
				"--backlog-dir",
				"backlog",
				"--config-location",
				"folder",
				"--no-git",
			],
			targetDir,
		);
		layout = await existingBacklogLayout(targetDir);
		if (layout === undefined) {
			throw new Error("Backlog initialization did not create a configuration");
		}
	}

	const { value: document } = layout.config;
	if (document.statuses === undefined) {
		throw new BacklogConfigurationError(layout.configPath, {
			cause: new Error("statuses is missing"),
		});
	}

	const statusesMatch =
		document.statuses.length === statuses.length &&
		document.statuses.every((status, index) => status === statuses[index]);

	const configRelativePath = relative(targetDir, layout.configPath);
	const tracked = await git(targetDir, "ls-files", "--", configRelativePath);
	const configIsTracked = tracked.split("\n").includes(configRelativePath);
	if (configIsTracked && !statusesMatch) {
		throw new RefusedPreconditionError(
			"A tracked Backlog configuration must already declare the pipeline statuses",
		);
	}
	if (configIsTracked) {
		await assertPinnedCliPreservesConfiguration(targetDir, layout);
		return;
	}
	if (statusesMatch) {
		return;
	}

	const configured = Bun.YAML.stringify(
		{ ...document, statuses: [...statuses] },
		null,
		2,
	);

	await Bun.write(layout.configPath, configured);
}

async function assertPinnedCliPreservesConfiguration(
	targetDir: string,
	layout: Immutable<
		NonNullable<Awaited<ReturnType<typeof existingBacklogLayout>>>
	>,
): Promise<void> {
	const fixture = await mkdtemp(join(tmpdir(), "rehearse-backlog-config-"));
	try {
		const configPath = join(fixture, relative(targetDir, layout.configPath));
		const boardPath = join(fixture, relative(targetDir, layout.directory));
		await mkdir(dirname(configPath), { recursive: true });
		await mkdir(boardPath, { recursive: true });
		await Bun.write(configPath, layout.config.source);
		await runCommand(["git", "init", "-q", "-b", "main"], fixture);
		await runCommand(["backlog", "task", "list", "--plain"], fixture);

		if ((await Bun.file(configPath).text()) !== layout.config.source) {
			throw new RefusedPreconditionError(
				"A tracked Backlog configuration must already be normalized by the pinned Backlog CLI",
			);
		}
	} finally {
		await rm(fixture, { force: true, recursive: true });
	}
}

/**
 * Seeds the target's board with the run's task and reports the commit the
 * stage's changes are measured from. It writes no commit of its own: the
 * board lives under the target's ignored workflow state, and the target's
 * project instructions are a property of the target, so a run that rewrote
 * them would grade the agent against a repository nobody has.
 */
export async function seedTaskBoard(
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
	const createdTask = await runCommand(
		[
			"backlog",
			"task",
			"create",
			title,
			"--description",
			description,
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

	return { taskId, taskSha: await git(targetDir, "rev-parse", "HEAD") };
}

export function readTaskOutput(
	targetDir: string,
	taskId: string,
): Promise<string> {
	return runCommand(["backlog", "task", taskId, "--json"], targetDir);
}

export interface TaskState {
	readonly output: string;
	readonly view: TaskView;
}

/**
 * The card file is the task's full record: goal, decisions, glossary, and
 * prose sections that backlog's JSON projection omits. Judges read the card;
 * the JSON stays for structural validation.
 */
export async function readTaskCard(
	targetDir: string,
	taskId: string,
): Promise<string> {
	const tasksDirectory = join(await boardDirectory(targetDir), "tasks");
	const entries = await readdir(tasksDirectory);
	const prefix = `${taskId.toLowerCase()} -`;
	const cardFile = entries.find((entry) =>
		entry.toLowerCase().startsWith(prefix),
	);
	if (cardFile === undefined) {
		throw new StageValidationError(`No task card found for ${taskId}`);
	}

	return Bun.file(join(tasksDirectory, cardFile)).text();
}

export function parseTaskState(output: string): TaskState {
	try {
		return { output, view: taskViewSchema.parse(JSON.parse(output)) };
	} catch {
		throw new StageValidationError("Backlog returned invalid task state");
	}
}

export function assertStageArtifactState(
	stage: PlanningStageDefinition,
	view: TaskView,
	documentFiles: readonly string[],
): string | undefined {
	if (
		stage.requiresAcceptanceCriteria &&
		view.task.acceptanceCriteria.length === 0
	) {
		throw new StageValidationError(
			`${stage.name} completed without acceptance criteria`,
		);
	}

	const expectedDoc = stage.artifact;
	if (expectedDoc === undefined) {
		return undefined;
	}

	const attachedReferences = view.task.documentation.map((reference) =>
		basename(reference),
	);
	const attachedIds = new Set(
		attachedReferences.map((reference) => reference.split(" ", 1)[0]),
	);
	const artifactFile = documentFiles.find((file) => {
		const [documentId] = file.split(" ", 1);
		return (
			(attachedReferences.includes(file) ||
				(documentId !== undefined && attachedIds.has(documentId))) &&
			file.toLowerCase().endsWith(`-${expectedDoc}.md`)
		);
	});

	if (artifactFile === undefined) {
		throw new StageValidationError(
			`${stage.name} completed without its durable ${expectedDoc} document`,
		);
	}

	return artifactFile;
}

export async function assertPlanningStageCompleted(
	targetDir: string,
	baselineSha: string,
	stage: PlanningStageDefinition,
	taskState: { readonly output: string; readonly view: TaskView },
	expectedBranch: ExpectedBranch = "main",
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
	const documentFiles = await readdir(join(board, "docs")).catch(() => []);
	const artifactFile = assertStageArtifactState(stage, view, documentFiles);
	if (artifactFile === undefined) {
		return { taskState: output, artifact: undefined, ...advance };
	}
	const artifactPath = join(relative(targetDir, board), "docs", artifactFile);

	return {
		taskState: output,
		artifact: {
			path: artifactPath,
			content: await Bun.file(join(targetDir, artifactPath)).text(),
		},
		...advance,
	};
}
