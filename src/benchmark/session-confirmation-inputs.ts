import { join } from "node:path";

import { hashCorpusFiles } from "./corpus-file";
import { resolveCorpusSource } from "./corpus-source";
import type { CorpusSourceResolver } from "./corpus-source";
import { measureCorpusVersion, measuredCorpusFiles } from "./corpus-version";
import { openGroupDirectory } from "./in-flight-claim";
import type { SessionConfirmationRequest } from "./session-confirmation-contract";
import SessionInputFiles from "./session-confirmation-frozen-inputs";
import type {
	FrozenSessionInputs,
	SessionInputDirectories,
} from "./session-confirmation-frozen-inputs";
import { freezeSessionCorpus } from "./session-corpus";
import { sessionLineage } from "./session-lineage";

async function openGroup({
	groupDirectory,
	inputsDirectory,
}: SessionInputDirectories): Promise<void> {
	await openGroupDirectory({ directory: groupDirectory, inputsDirectory });
}

async function freezeInputs(
	request: SessionConfirmationRequest,
	directories: SessionInputDirectories,
	resolveCorpus: CorpusSourceResolver = resolveCorpusSource,
): Promise<FrozenSessionInputs> {
	await openGroup(directories);
	const source = await resolveCorpus(request.corpus);
	const corpusVersion = await measureCorpusVersion(
		request.runsDirectory,
		source,
	);
	const corpusDirectory = join(directories.inputsDirectory, "corpus");
	const corpusSnapshot = await freezeSessionCorpus(
		source,
		corpusDirectory,
		request.sessionCase.corpusFiles,
	);
	const corpusFiles = await hashCorpusFiles(
		corpusSnapshot,
		request.sessionCase.corpusFiles,
	);
	const recorded = await new SessionInputFiles(directories).record(
		request.sessionCase,
		corpusDirectory,
	);
	const settings = {
		budgetUsd: request.sessionBudgetUsd,
		effort: request.effort,
		model: request.model,
	};
	const lineage = await sessionLineage(
		recorded.sessionCase,
		corpusFiles,
		settings,
	);

	return {
		corpusFiles,
		corpusSnapshot,
		corpusVersion,
		...recorded,
		lineage,
		settings,
		versionFiles: await measuredCorpusFiles(
			request.runsDirectory,
			corpusVersion,
		),
	};
}
export { freezeInputs as default };
