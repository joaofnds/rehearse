import { join, relative } from "node:path";

const SUCCESS_EXIT_CODE = 0;
const NO_IGNORED_PATHS_EXIT_CODE = 1;

interface GitContext {
	readonly repository: string;
	readonly root: string;
}

async function ignoredPaths(
	{ repository, root }: GitContext,
	paths: readonly string[],
): Promise<string[]> {
	const relativePaths = paths
		.filter((path) => repository === "" || path.startsWith(`${repository}/`))
		.map((path) => relative(repository, path));

	const query = Bun.spawn(
		["git", "check-ignore", "--no-index", "--stdin", "-z"],
		{
			cwd: join(root, repository),
			stderr: "inherit",
			stdin: new Blob([relativePaths.map((path) => `${path}\0`).join("")]),
			stdout: "pipe",
		},
	);
	const output = await new Response(query.stdout).text();
	const exitCode = await query.exited;

	if (
		exitCode !== SUCCESS_EXIT_CODE &&
		exitCode !== NO_IGNORED_PATHS_EXIT_CODE
	) {
		throw new Error("Cannot inspect Git exclusions for quality policy");
	}

	return output
		.split("\0")
		.filter(Boolean)
		.map((path) => join(repository, path));
}

async function qualityGitExclusionFailures(
	root: string,
	paths: readonly string[],
	repositories: readonly string[],
): Promise<string[]> {
	const contexts = [...new Set(["", ...repositories])];
	const matches = await Promise.all(
		contexts.map(
			async (repository) => await ignoredPaths({ repository, root }, paths),
		),
	);

	return [...new Set(matches.flat())]
		.toSorted()
		.map(
			(path) =>
				`${path}: Git exclusions must not hide maintained files from quality checks`,
		);
}

export { qualityGitExclusionFailures as default };
