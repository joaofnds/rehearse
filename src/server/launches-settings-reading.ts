import {
	LINK_CORPUS_COMMAND,
	SET_SPEND_CEILING_COMMAND,
	readSettings,
} from "#benchmark/settings";
import type { Settings } from "#benchmark/settings";
import { CEILING_OVERRUN_STATEMENT } from "#benchmark/spend-ceiling";
import { HTTP_STATUS_CONFLICT } from "#server/http-status";
import { LaunchRefusalError, asLaunchRefusal } from "#server/launch-refusal";
import type { LaunchDependencies } from "#server/launches-contract";

/**
 * What the settings screen and the launch dialog show. The records location
 * is read, never written: the environment variable that points every command
 * at it owns it.
 */
async function settingsReading(dependencies: LaunchDependencies): Promise<{
	readonly spendCeilingUsd: number | null;
	readonly setCommand: string;
	readonly recordsDirectory: string;
	readonly linkedCorpus: {
		readonly kind: "live" | "directory";
		readonly root: string;
	};
	readonly liveCorpusRoot: string;
	readonly overrun: string;
	readonly linkCommand: string;
}> {
	const settings = await storedSettings(dependencies.runsDirectory);
	const { linkedCorpusDirectory } = settings;
	const liveRoot = dependencies.liveCorpus().root;

	return {
		linkCommand: LINK_CORPUS_COMMAND,
		linkedCorpus:
			linkedCorpusDirectory === undefined
				? { kind: "live", root: liveRoot }
				: { kind: "directory", root: linkedCorpusDirectory },
		liveCorpusRoot: liveRoot,
		overrun: CEILING_OVERRUN_STATEMENT,
		recordsDirectory: dependencies.runsDirectory,
		setCommand: SET_SPEND_CEILING_COMMAND,
		spendCeilingUsd: settings.spendCeilingUsd ?? null,
	};
}

/** An unreadable settings file refuses the launch the way no ceiling does. */
async function storedSettings(runsDirectory: string): Promise<Settings> {
	return await asLaunchRefusal(async () => await readSettings(runsDirectory));
}

async function launchSpendCeiling(runsDirectory: string): Promise<number> {
	const { spendCeilingUsd } = await storedSettings(runsDirectory);
	if (spendCeilingUsd === undefined) {
		throw new LaunchRefusalError(
			`No spend ceiling is stored, and nothing spends without one. Set it with: ${SET_SPEND_CEILING_COMMAND}`,
			HTTP_STATUS_CONFLICT,
		);
	}

	return spendCeilingUsd;
}

export { settingsReading, storedSettings, launchSpendCeiling };
