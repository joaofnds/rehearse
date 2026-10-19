import { CONTROL_DIR } from "#benchmark/config";
import type { ReplayRequest } from "#benchmark/replay";
import { git } from "#benchmark/target";

import {
	replayCorpus,
	replayDeclaredTarget,
	replaySettingsFile,
} from "./replay-case-inputs";
import type { ReplayExecution } from "./replay-command-contracts";
/**
 * Replay exists to iterate on an uncommitted corpus, so a dirty control
 * repository is expected; the record marks it instead of refusing.
 */
async function currentControlSha(): Promise<string> {
	const sha = await git(CONTROL_DIR, "rev-parse", "HEAD");
	const status = await git(
		CONTROL_DIR,
		"status",
		"--porcelain=v1",
		"--untracked-files=all",
	);

	return status ? `${sha}-dirty` : sha;
}

async function prepareReplayRequest(
	{ config, paths }: ReplayExecution,
	spendCeilingUsd: number,
): Promise<ReplayRequest> {
	const [corpus, loadedSettings, declaredTargetRoot] = await Promise.all([
		replayCorpus(config.corpus),
		replaySettingsFile(paths.manifestFile),
		replayDeclaredTarget(paths.manifestFile),
	]);
	const replayRequest: ReplayRequest = {
		controlSha: await currentControlSha(),
		corpusSource: corpus.source,
		declaredTargetRoot,
		effort: config.effort,
		instructions: corpus.instructions,
		judgeEffort: config.judgeEffort,
		judgeModel: config.judgeModel,
		loadedSettings,
		model: config.model,
		paths,
		sessionBudgetUsd: config.sessionBudgetUsd,
		settingSources: corpus.settingSources,
		spendCeilingUsd,
		stage: config.stage,
	};

	return replayRequest;
}

export { prepareReplayRequest as default };
