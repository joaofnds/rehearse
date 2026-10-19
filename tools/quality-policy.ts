import { basename, join } from "node:path";

import qualityComments from "./quality-comments";
import qualityConfigFailures from "./quality-config";
import maintainedScope from "./quality-files";
import qualityGitExclusionFailures from "./quality-git-files";

const PREFIX_START_INDEX = 0;
const EMPTY_COLLECTION_LENGTH = 0;
const configNames = new Set([
	".oxlintrc.json",
	".oxfmtrc.json",
	".stylelintrc.json",
]);
const configFilename =
	/^(?:\.ox(?:lint|fmt)rc\.(?:jsonc?|[cm]?[jt]s)|\.stylelintrc(?:\.(?:jsonc?|ya?ml|[cm]?[jt]s))?|stylelint\.config\.[cm]?[jt]s|\.(?:eslint|prettier|stylelint)ignore)$/u;

const sourceFilename =
	/\.(?:[cm]?[jt]sx?|css|s[ac]ss|less|html|mdx?|ya?ml|toml|jsonc?)$/u;

function hasQualityChecks(path: string): boolean {
	return (
		basename(path) === "package.json" ||
		configFilename.test(basename(path)) ||
		sourceFilename.test(path)
	);
}

async function qualitySourceFailures(
	path: string,
	source: string,
): Promise<string[]> {
	const directive =
		/^\s*\**\s*(?:(?:eslint|oxlint|stylelint)-(?:disable|enable)\b|(?:eslint|oxlint)\s|(?:prettier|oxfmt|biome)-ignore\b|@ts-(?:ignore|nocheck|expect-error)\b)/u;
	const comments = await qualityComments(path, source);
	return comments
		.filter((comment) => directive.test(comment.value))
		.toSorted((left, right) => left.start - right.start)
		.map((comment) => {
			const line = source
				.slice(PREFIX_START_INDEX, comment.start)
				.split("\n").length;
			return `${path}:${String(line)}: quality-check suppression is forbidden`;
		});
}

function configFileFailures(path: string, source: string): string[] {
	if (!configFilename.test(basename(path))) {
		return [];
	}
	return configNames.has(path)
		? qualityConfigFailures(path, source)
		: [`${path}: additional quality configurations are forbidden`];
}

async function qualityFileFailures(
	path: string,
	source: string,
): Promise<string[]> {
	return [
		...(basename(path) === "package.json"
			? qualityConfigFailures(path, source)
			: []),
		...configFileFailures(path, source),
		...(sourceFilename.test(path)
			? await qualitySourceFailures(path, source)
			: []),
	];
}

async function checkQualityPolicy(root: string): Promise<string[]> {
	const maintained = await maintainedScope(root);
	const paths = maintained.paths.filter((path) => hasQualityChecks(path));
	const failures = await qualityGitExclusionFailures(
		root,
		paths,
		maintained.repositories,
	);

	await Array.fromAsync(paths, async (path) => {
		const file = Bun.file(join(root, path));
		if (!(await file.exists())) {
			return;
		}

		failures.push(...(await qualityFileFailures(path, await file.text())));
	});

	return failures;
}

if (import.meta.main) {
	const failures = await checkQualityPolicy(process.cwd());
	if (failures.length > EMPTY_COLLECTION_LENGTH) {
		process.stderr.write(`${failures.join("\n")}\n`);
		process.exitCode = 1;
	}
}

export { qualitySourceFailures };
export { default as qualityConfigFailures } from "./quality-config";
