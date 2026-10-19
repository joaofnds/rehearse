import { cp, mkdir } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

import { existingBacklogLayout } from "./backlog-layout";
import { SymlinkedEntryError, lstatIfPresent } from "./file-presence";

const PREFIX_START_INDEX = 0;

type WorkflowPath = string;

const WORKFLOW_PATHS: readonly WorkflowPath[] = [
	"backlog",
	"backlog.config.yml",
	".backlog",
	".boris",
];

interface WorkflowEntry {
	readonly path: WorkflowPath;
	readonly absolutePath: string;
	readonly isDirectory: boolean;
}

function contains(parent: string, child: string): boolean {
	return child === parent || child.startsWith(`${parent}${sep}`);
}

async function managedWorkflowPaths(
	root: string,
): Promise<readonly WorkflowPath[]> {
	const layout = await existingBacklogLayout(root);
	const configured =
		layout === undefined ? undefined : relative(root, layout.directory);
	const paths = [
		...WORKFLOW_PATHS,
		...(configured === undefined ? [] : [configured]),
	]
		.filter((path, index, all) => all.indexOf(path) === index)
		.toSorted((left, right) => left.length - right.length);

	return paths.filter(
		(path, index) =>
			!paths
				.slice(PREFIX_START_INDEX, index)
				.some((parent) => contains(parent, path)),
	);
}

interface WorkflowEntryRequest {
	readonly root: string;
	readonly path: WorkflowPath;
}

async function workflowEntry({
	root,
	path,
}: WorkflowEntryRequest): Promise<WorkflowEntry | undefined> {
	const absolutePath = join(root, path);
	const stats = await lstatIfPresent(absolutePath);
	if (stats === undefined) {
		return undefined;
	}

	if (stats.isSymbolicLink()) {
		throw new SymlinkedEntryError(
			`${path} is a link, so its bytes are not workflow state held by the target`,
		);
	}

	if (!stats.isDirectory() && !stats.isFile()) {
		throw new Error(`${path} is not a file or directory`);
	}

	return { absolutePath, isDirectory: stats.isDirectory(), path };
}

async function existingWorkflowEntries(
	root: string,
	paths?: readonly WorkflowPath[],
): Promise<readonly WorkflowEntry[]> {
	const entries: WorkflowEntry[] = [];
	const managedPaths = paths ?? (await managedWorkflowPaths(root));

	await Array.fromAsync(managedPaths, async (path) => {
		const entry = await workflowEntry({ path, root });
		if (entry !== undefined) {
			entries.push(entry);
		}
	});

	return entries;
}

async function copyWorkflowState(
	from: string,
	to: string,
	paths?: readonly WorkflowPath[],
): Promise<readonly WorkflowPath[]> {
	const entries = await existingWorkflowEntries(
		from,
		paths ?? (await managedWorkflowPaths(from)),
	);
	await copyWorkflowEntries(entries, to);

	return entries.map((entry) => entry.path);
}

async function copyWorkflowEntries(
	entries: readonly WorkflowEntry[],
	to: string,
): Promise<void> {
	await Array.fromAsync(entries, async (entry) => {
		await mkdir(dirname(join(to, entry.path)), { recursive: true });
		await cp(entry.absolutePath, join(to, entry.path), { recursive: true });
	});
}

export { managedWorkflowPaths, existingWorkflowEntries, copyWorkflowState };
export type { WorkflowPath, WorkflowEntry };
