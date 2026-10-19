import { lstat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { z } from "zod";

import { SymlinkedEntryError } from "./file-presence";
import serialMap from "./serial-map";

const rootBacklogConfigSchema = z
	.object({
		backlog_directory: z.string().optional(),
		statuses: z.array(z.string()).optional(),
	})
	.loose();

type BacklogConfig = z.infer<typeof rootBacklogConfigSchema>;

class BacklogConfigurationError extends Error {
	public constructor(path: string, options: Readonly<ErrorOptions>) {
		super(`Invalid Backlog configuration: ${path}`, options);
		this.name = "BacklogConfigurationError";
	}
}

interface BacklogLayout {
	readonly config: {
		readonly source: string;
		readonly value: BacklogConfig;
	};
	readonly configPath: string;
	readonly directory: string;
}

async function refuseLinkedComponents(
	targetDir: string,
	path: string,
): Promise<void> {
	let current = targetDir;
	try {
		for await (const stats of serialMap(
			path.split(sep).values(),
			async (component) => {
				current = join(current, component);
				return await lstat(current);
			},
		)) {
			if (stats.isSymbolicLink()) {
				throw new SymlinkedEntryError(
					`${path} contains a link, so it is not workflow state held by the target`,
				);
			}
			if (!stats.isDirectory()) {
				throw new Error(`${path} is not a directory`);
			}
		}
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return;
		}
		throw error;
	}
}

async function resolveBacklogDirectory(
	targetDir: string,
	configured: string,
): Promise<string> {
	const directory = resolve(targetDir, configured);
	const relativeDirectory = relative(targetDir, directory);

	if (
		relativeDirectory === "" ||
		relativeDirectory === ".." ||
		relativeDirectory.startsWith(`..${sep}`) ||
		isAbsolute(relativeDirectory)
	) {
		throw new Error("Backlog directory must stay inside the target repository");
	}

	if (
		relativeDirectory === ".git" ||
		relativeDirectory.startsWith(`.git${sep}`)
	) {
		throw new Error("Backlog directory must not use Git administrative state");
	}

	await refuseLinkedComponents(targetDir, relativeDirectory);

	return directory;
}

async function configExists(path: string): Promise<boolean> {
	try {
		const stats = await lstat(path);
		if (stats.isSymbolicLink()) {
			throw new SymlinkedEntryError(
				`${path} is a link, so it is not configuration held by the target`,
			);
		}
		if (!stats.isFile()) {
			throw new Error(`${path} is not a configuration file`);
		}
		return true;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return false;
		}
		throw error;
	}
}

async function readBacklogConfig(
	path: string,
): Promise<{ readonly source: string; readonly value: BacklogConfig }> {
	const source = await Bun.file(path).text();
	try {
		return {
			source,
			value: rootBacklogConfigSchema.parse(Bun.YAML.parse(source)),
		};
	} catch (error) {
		throw new BacklogConfigurationError(path, { cause: error });
	}
}

async function existingBacklogLayout(
	targetDir: string,
): Promise<BacklogLayout | undefined> {
	const rootConfigPath = join(targetDir, "backlog.config.yml");
	if (await configExists(rootConfigPath)) {
		const config = await readBacklogConfig(rootConfigPath);
		const configured = config.value.backlog_directory;

		return {
			config,
			configPath: rootConfigPath,
			directory: await resolveBacklogDirectory(
				targetDir,
				configured?.trim() ?? "backlog",
			),
		};
	}

	for await (const { directory, configPath, exists } of serialMap(
		["backlog", ".backlog"].values(),
		async (boardDirectory) => {
			const candidatePath = join(targetDir, boardDirectory, "config.yml");
			return {
				configPath: candidatePath,
				directory: boardDirectory,
				exists: await configExists(candidatePath),
			};
		},
	)) {
		if (exists) {
			await refuseLinkedComponents(targetDir, directory);

			return {
				config: await readBacklogConfig(configPath),
				configPath,
				directory: join(targetDir, directory),
			};
		}
	}

	return undefined;
}

export { BacklogConfigurationError, existingBacklogLayout };
export type { BacklogConfig, BacklogLayout };
