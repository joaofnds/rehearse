import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import inputPatterns from "./quality-inputs";

interface MaintainedScope {
	readonly paths: readonly string[];
	readonly repositories: readonly string[];
}

const inputs = [...inputPatterns, "**/node_modules/**", "client/dist/**"].map(
	(pattern) =>
		new Bun.Glob(pattern.endsWith("/**") ? pattern : `${pattern}/**`),
);

async function maintainedEntry(
	root: string,
	directory: string,
	entry: Readonly<Dirent>,
): Promise<MaintainedScope> {
	const path = join(directory, entry.name);

	if (inputs.some((input) => input.match(path) || input.match(`${path}/`))) {
		return { paths: [], repositories: [] };
	}

	if (entry.name === ".git") {
		return { paths: [], repositories: [directory] };
	}

	if (entry.isDirectory()) {
		return await maintainedDirectory(root, path);
	}

	return { paths: [path], repositories: [] };
}

async function maintainedDirectory(
	root: string,
	directory: string,
): Promise<MaintainedScope> {
	const entries = await readdir(join(root, directory), { withFileTypes: true });
	const children = await Promise.all(
		entries.map(async (entry) => await maintainedEntry(root, directory, entry)),
	);

	return {
		paths: children.flatMap((child) => child.paths),
		repositories: children.flatMap((child) => child.repositories),
	};
}

async function maintainedScope(root: string): Promise<MaintainedScope> {
	const scope = await maintainedDirectory(root, "");
	return {
		paths: scope.paths.toSorted(),
		repositories: scope.repositories.toSorted(),
	};
}

export { maintainedScope as default };
