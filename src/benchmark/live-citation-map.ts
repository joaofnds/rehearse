import { readdir, realpath } from "node:fs/promises";
import { join } from "node:path";

import {
	CORPUS_INSTRUCTIONS_PATH,
	CORPUS_LAYOUT_DIRECTORIES,
} from "./corpus-file";
import type { LiveCorpusRoot } from "./corpus-file";
import { lstatIfPresent, statIfExists } from "./file-presence";
import type {
	HomePathCitationMap,
	HomePathCitationRoot,
} from "./home-path-citation";

async function linkedRootsAt(
	path: string,
	layoutPath: string,
	visited: Set<string>,
): Promise<readonly HomePathCitationRoot[]> {
	const entry = await lstatIfPresent(path);
	const target = await statIfExists(path);
	if (entry === undefined || target === undefined) {
		return [];
	}

	const roots: HomePathCitationRoot[] = entry.isSymbolicLink()
		? [
				{ layoutPath, path },
				{ layoutPath, path: await realpath(path) },
			]
		: [];
	if (!target.isDirectory()) {
		return roots;
	}

	return [...roots, ...(await linkedRootsUnder(path, layoutPath, visited))];
}

async function linkedRootsUnder(
	directory: string,
	layoutPath: string,
	visited: Set<string>,
): Promise<readonly HomePathCitationRoot[]> {
	const resolved = await realpath(directory);
	if (visited.has(resolved)) {
		return [];
	}

	visited.add(resolved);
	const children = await Array.fromAsync(
		await readdir(directory),
		async (name) =>
			await linkedRootsAt(
				join(directory, name),
				join(layoutPath, name),
				visited,
			),
	);

	return children.flat();
}

async function entryRoots(
	path: string,
	layoutPath: string,
): Promise<readonly HomePathCitationRoot[]> {
	if ((await lstatIfPresent(path)) === undefined) {
		return [];
	}

	return [
		{ layoutPath, path },
		...(await linkedRootsAt(path, layoutPath, new Set())),
	];
}

/**
 * Every absolute path through which the live install's corpus files can be
 * cited, each with the layout path it holds: the layout entries of the live
 * root and of the tree it links into, and the target of every link inside
 * them, since a citation names the file
 * where its author keeps it rather than where the install links it from.
 */
async function liveCitationMap(
	source: LiveCorpusRoot,
	home: string,
): Promise<HomePathCitationMap> {
	const roots: HomePathCitationRoot[] = [];
	await Array.fromAsync(
		[CORPUS_INSTRUCTIONS_PATH, ...CORPUS_LAYOUT_DIRECTORIES],
		async (layoutPath) => {
			roots.push(
				...(await entryRoots(join(source.root, layoutPath), layoutPath)),
				...(await entryRoots(join(source.backingRoot, layoutPath), layoutPath)),
			);
		},
	);

	return {
		home,
		roots: [...new Map(roots.map((root) => [root.path, root])).values()],
	};
}

export { liveCitationMap as default };
