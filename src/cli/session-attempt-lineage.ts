import type { SessionCase } from "#benchmark/case";
import type { SessionSettings } from "#benchmark/claude";
import type { SessionRunConfig } from "#benchmark/config";
import type { ResolvedCorpusFile } from "#benchmark/corpus-file";
import { SymlinkedEntryError } from "#benchmark/file-presence";
import { sessionLineage } from "#benchmark/session-lineage";
import { RefusedPreconditionError } from "#cli/interactive-stdin";

function settingsOf(config: SessionRunConfig): SessionSettings {
	return {
		budgetUsd: config.sessionBudgetUsd,
		effort: config.effort,
		model: config.model,
	};
}

/**
 * The fixture tree is hashed into the lineage before the attempt seeds it, so
 * a tree the harness would refuse to seed is refused here first. Without this
 * translation the earlier walk would surface a raw error where the later copy
 * gives a named refusal, and which one a case author saw would depend on
 * nothing they can see.
 */
async function lineageOf(
	sessionCase: SessionCase,
	corpusFiles: readonly ResolvedCorpusFile[],
	settings: SessionSettings,
): Promise<string> {
	try {
		return await sessionLineage(sessionCase, corpusFiles, settings);
	} catch (error) {
		if (error instanceof SymlinkedEntryError) {
			throw new RefusedPreconditionError(error.message);
		}

		throw error;
	}
}

export { lineageOf, settingsOf };
