import { join } from "node:path";

import type { HashedFile } from "./checkpoint";
import { CONTROL_DIR } from "./config";
import type { CorpusRoot } from "./corpus-file";
import type { RunLiveness, TargetClaim } from "./run-liveness";
import {
	DEFAULT_STAGE_SETTINGS_FILE,
	loadStageSettings,
} from "./stage-settings";

function claimBy(
	run: string,
	pid: number,
	startedAt = "2026-09-30T00:00:00.000Z",
): TargetClaim {
	return { pid, run, startedAt };
}

const nothingRunning: RunLiveness = {
	isAlive: () => false,
	readMarker: async () => {
		await Promise.try((): undefined => undefined);
	},
};

function directorySource(root: string): CorpusRoot {
	return { kind: "directory", root };
}

function fixedCorpusSource(source: CorpusRoot): () => Promise<CorpusRoot> {
	return async () => await Promise.resolve(source);
}

function corpusPath(stage: string): string {
	return `skills/${stage}/SKILL.md`;
}

async function liveStageSettings(): Promise<HashedFile> {
	const loaded = await loadStageSettings(
		join(CONTROL_DIR, DEFAULT_STAGE_SETTINGS_FILE),
	);

	return loaded.hashed;
}

export {
	claimBy,
	corpusPath,
	directorySource,
	fixedCorpusSource,
	liveStageSettings,
	nothingRunning,
};
