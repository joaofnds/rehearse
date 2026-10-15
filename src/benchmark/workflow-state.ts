import { cp, lstat, mkdir } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { existingBacklogLayout } from "./backlog-layout";
import { SymlinkedEntryError } from "./file-presence";

export type WorkflowPath = string;

const WORKFLOW_PATHS: readonly WorkflowPath[] = [
	"backlog",
	"backlog.config.yml",
	".backlog",
	".boris",
];

export interface WorkflowEntry {
	readonly path: WorkflowPath;
	readonly absolutePath: string;
	readonly isDirectory: boolean;
}

function contains(parent: string, child: string): boolean {
	return child === parent || child.startsWith(`${parent}${sep}`);
}

export async function managedWorkflowPaths(
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
			!paths.slice(0, index).some((parent) => contains(parent, path)),
	);
}

export async function existingWorkflowEntries(
	root: string,
	paths?: readonly WorkflowPath[],
): Promise<readonly WorkflowEntry[]> {
	const entries: WorkflowEntry[] = [];
	const managedPaths = paths ?? (await managedWorkflowPaths(root));

	for (const path of managedPaths) {
		const absolutePath = join(root, path);
		try {
			const stats = await lstat(absolutePath);
			if (stats.isSymbolicLink()) {
				throw new SymlinkedEntryError(
					`${path} is a link, so its bytes are not workflow state held by the target`,
				);
			}
			if (!stats.isDirectory() && !stats.isFile()) {
				throw new Error(`${path} is not a file or directory`);
			}
			entries.push({ path, absolutePath, isDirectory: stats.isDirectory() });
		} catch (error) {
			if (
				error instanceof Error &&
				"code" in error &&
				error.code === "ENOENT"
			) {
				continue;
			}

			throw error;
		}
	}

	return entries;
}

export async function copyWorkflowState(
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
	for (const entry of entries) {
		await mkdir(dirname(join(to, entry.path)), { recursive: true });
		await cp(entry.absolutePath, join(to, entry.path), { recursive: true });
	}
}
