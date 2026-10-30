import { mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";

import type { ReplayCliConfig } from "#benchmark/config";
import { parseReplayArgs, recordsDirectory } from "#benchmark/config";
import { benchmarkRunPaths } from "#benchmark/run-layout";
import type { CliTestWorkspace } from "#cli/cli-test-support";
import writeReplayableRunManifest from "#cli/replay-test-support";

import type { ReplayExecution } from "./replay-command-contracts";

const sessionArgs = [
	"--model",
	"sonnet",
	"--effort",
	"medium",
	"--judge-model",
	"opus",
	"--session-budget-usd",
	"1",
];
function replayConfigFor(runName: string, corpus: string): ReplayCliConfig {
	return parseReplayArgs([
		"--run",
		runName,
		"--stage",
		"shape",
		"--corpus",
		corpus,
		...sessionArgs,
	]);
}
async function escapedCorpusReplay(
	workspace: Readonly<CliTestWorkspace>,
): Promise<ReplayExecution> {
	const root = await workspace.createDirectory("rehearse-replay-corpus-");
	const outside = await workspace.createDirectory("rehearse-replay-outside-");
	const manifestFile = await writeReplayableRunManifest(
		"any-name-corpus-linked",
	);
	workspace.track(manifestFile);
	await mkdir(join(root, "skills"), { recursive: true });
	await Bun.write(join(outside, "secret.md"), "SECRET BYTES\n");
	await symlink(join(outside, "secret.md"), join(root, "CLAUDE.md"));
	return {
		config: replayConfigFor("any-name-corpus-linked", root),
		paths: benchmarkRunPaths(recordsDirectory(), "any-name-corpus-linked"),
	};
}

export { escapedCorpusReplay, replayConfigFor, sessionArgs };
