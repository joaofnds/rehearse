import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

import {
	BacklogConfigurationError,
	existingBacklogLayout,
} from "./backlog-layout";
import type { BacklogLayout } from "./backlog-layout";
import { runCommand } from "./command";
import type { Immutable } from "./contracts";
import { RefusedPreconditionError } from "./exit-codes";
import { git } from "./target";

const BACKLOG_YAML_INDENT_SPACES = 2;

async function boardDirectory(targetDir: string): Promise<string> {
	const layout = await existingBacklogLayout(targetDir);
	return layout?.directory ?? join(targetDir, "backlog");
}

async function ensureBacklogLayout(targetDir: string): Promise<BacklogLayout> {
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

	return layout;
}

function configuredStatuses(
	layout: Immutable<BacklogLayout>,
): readonly string[] {
	if (layout.config.value.statuses === undefined) {
		throw new BacklogConfigurationError(layout.configPath, {
			cause: new Error("statuses is missing"),
		});
	}

	return layout.config.value.statuses;
}

interface TrackedBacklogConfiguration {
	readonly targetDir: string;
	readonly configPath: string;
}

async function configurationIsTracked({
	targetDir,
	configPath,
}: TrackedBacklogConfiguration): Promise<boolean> {
	const configRelativePath = relative(targetDir, configPath);
	const tracked = await git(targetDir, "ls-files", "--", configRelativePath);

	return tracked.split("\n").includes(configRelativePath);
}

async function configureBacklog(
	targetDir: string,
	statuses: readonly string[],
): Promise<void> {
	const layout = await ensureBacklogLayout(targetDir);
	const currentStatuses = configuredStatuses(layout);
	const statusesMatch =
		currentStatuses.length === statuses.length &&
		currentStatuses.every((status, index) => status === statuses[index]);

	if (
		await configurationIsTracked({ configPath: layout.configPath, targetDir })
	) {
		if (!statusesMatch) {
			throw new RefusedPreconditionError(
				"A tracked Backlog configuration must already declare the pipeline statuses",
			);
		}

		await assertPinnedCliPreservesConfiguration(targetDir, layout);

		return;
	}

	if (!statusesMatch) {
		await writeConfiguredStatuses(layout, statuses);
	}
}

async function writeConfiguredStatuses(
	layout: Immutable<BacklogLayout>,
	statuses: readonly string[],
): Promise<void> {
	const configured = Bun.YAML.stringify(
		{ ...layout.config.value, statuses: [...statuses] },
		null,
		BACKLOG_YAML_INDENT_SPACES,
	);
	await Bun.write(layout.configPath, configured);
}

interface BacklogConfigurationProbe {
	readonly fixture: string;
	readonly targetDir: string;
	readonly layout: Immutable<BacklogLayout>;
}

async function prepareConfigurationProbe({
	fixture,
	targetDir,
	layout,
}: BacklogConfigurationProbe): Promise<string> {
	const configPath = join(fixture, relative(targetDir, layout.configPath));
	const boardPath = join(fixture, relative(targetDir, layout.directory));

	await mkdir(dirname(configPath), { recursive: true });
	await mkdir(boardPath, { recursive: true });

	await Bun.write(configPath, layout.config.source);

	await runCommand(["git", "init", "-q", "-b", "main"], fixture);

	return configPath;
}

async function assertPinnedCliPreservesConfiguration(
	targetDir: string,
	layout: Immutable<BacklogLayout>,
): Promise<void> {
	const fixture = await mkdtemp(join(tmpdir(), "rehearse-backlog-config-"));
	try {
		const configPath = await prepareConfigurationProbe({
			fixture,
			layout,
			targetDir,
		});
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

export { boardDirectory, configureBacklog };
