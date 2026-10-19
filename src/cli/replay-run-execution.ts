import { randomUUID } from "node:crypto";

import { runReplay } from "#benchmark/replay";
import executeReplayStage from "#benchmark/replay-command";
import runReplayConfirmation from "#benchmark/replay-confirmation";
import { diagnosticWriter, signalDiagnostics } from "#cli/output";
import terminalQuestioner from "#cli/questioner";

import { replayCorpusRoots } from "./replay-case-inputs";
import type {
	ReplayAttempts,
	ReplayAuthorization,
	ReplayCommandOutcome,
	ReplayExecution,
} from "./replay-command-contracts";
import prepareReplayRequest from "./replay-run-inputs";
import ReplayRuntime from "./replay-runtime";

async function executeReplay(
	{ config, paths }: ReplayExecution,
	{ output, spendCeilingUsd }: ReplayAuthorization,
): Promise<ReplayCommandOutcome> {
	const replayRequest = await prepareReplayRequest(
		{ config, paths },
		spendCeilingUsd,
	);
	const replayDependencies = new ReplayRuntime({
		corpusSource: replayRequest.corpusSource,
		output,
		runsDirectory: paths.runsDirectory,
	});
	const questioner = terminalQuestioner(signalDiagnostics(output).flush);

	try {
		return await executeReplayStage(config, replayRequest, {
			approval: {
				output: diagnosticWriter(output),
				prompt: async (message) => await questioner.question(message),
			},
			corpusRoots: await replayCorpusRoots(
				paths.manifestFile,
				replayRequest.corpusSource,
			),
			groupId: randomUUID,
			...replayAttempts(replayDependencies),
		});
	} finally {
		questioner.close();
	}
}

function replayAttempts(replayDependencies: ReplayRuntime): ReplayAttempts {
	return {
		runConfirmed: async (confirmationRequest) =>
			await runReplayConfirmation(replayDependencies, confirmationRequest),
		runDebug: async (debugRequest) => {
			const outcome = await runReplay(replayDependencies, debugRequest);

			return {
				lineage: outcome.record.consumed.lineage,
				recordPath: outcome.recordPath,
			};
		},
	};
}

export { executeReplay as default };
