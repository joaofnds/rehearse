import { realpath } from "node:fs/promises";

import { z } from "zod";

import type { LiveCorpusRoot } from "#benchmark/corpus-file";
import {
	CorpusSourceError,
	linkCorpus,
	linkedCorpusSource,
	unlinkCorpus,
} from "#benchmark/corpus-source";
import { measureCorpusVersion } from "#benchmark/corpus-version";
import { HTTP_STATUS_CONFLICT } from "#server/http-status";
import { LaunchRefusalError, asLaunchRefusal } from "#server/launch-refusal";
import type {
	LaunchDependencies,
	SetupCorpusChoice,
} from "#server/launches-contract";
import { redactAbsolutePaths } from "#server/redact-path";

/** A directory that is not a corpus is a conflict with what is on disk. */
async function linkCorpusDirectory(
	runsDirectory: string,
	directory: string,
): Promise<void> {
	try {
		await linkCorpus(runsDirectory, directory);
	} catch (error) {
		if (!(error instanceof CorpusSourceError)) {
			throw error;
		}

		throw new LaunchRefusalError(
			redactAbsolutePaths(error.message),
			HTTP_STATUS_CONFLICT,
		);
	}
}

/**
 * Records a version of the linked corpus now, so the version log holds it
 * before any run reads it. A layout it cannot measure is refused with why.
 */
async function measureLinkedCorpus(runsDirectory: string): Promise<string> {
	const source = await asLaunchRefusal(
		async () => await linkedCorpusSource(runsDirectory),
	);
	const measurement = await measureCorpusVersion(runsDirectory, source);
	if (measurement.kind === "refused") {
		throw new LaunchRefusalError(
			redactAbsolutePaths(measurement.refusal),
			HTTP_STATUS_CONFLICT,
		);
	}

	return measurement.digest;
}

const fileErrorSchema = z.object({ code: z.string() }).loose();

/** A path that does not exist resolves to nothing; any other failure throws. */
async function resolvedPath(path: string): Promise<string | undefined> {
	try {
		return await realpath(path);
	} catch (error) {
		const parsed = fileErrorSchema.safeParse(error);
		if (
			parsed.success &&
			(parsed.data.code === "ENOENT" || parsed.data.code === "ENOTDIR")
		) {
			return undefined;
		}

		throw error;
	}
}

/**
 * Whether a typed path names the live install under another spelling, such
 * as ~/.claude, a symlink to it, or a trailing slash. Linking the live root
 * as a directory would make every pipeline launch refuse.
 */
async function namesLiveInstall(
	directory: string,
	live: LiveCorpusRoot,
): Promise<boolean> {
	const typed = await resolvedPath(directory);

	return typed !== undefined && typed === (await resolvedPath(live.root));
}

/**
 * Links the directory setup scanned, or leaves the live install linked when
 * the path is empty or names it, clearing a directory an earlier scan linked.
 */
async function storeSetupCorpus(
	dependencies: LaunchDependencies,
	choice: SetupCorpusChoice,
): Promise<void> {
	if (
		choice.kind === "live" ||
		(await namesLiveInstall(choice.directory, dependencies.liveCorpus()))
	) {
		await asLaunchRefusal(async () => {
			await unlinkCorpus(dependencies.runsDirectory);
		});
		return;
	}

	await asLaunchRefusal(async () => {
		await linkCorpusDirectory(dependencies.runsDirectory, choice.directory);
	});
}

export { linkCorpusDirectory, measureLinkedCorpus, storeSetupCorpus };
