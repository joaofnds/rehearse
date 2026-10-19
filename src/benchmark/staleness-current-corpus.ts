import type { StageCorpus, StalenessLink } from "./checkpoint";
import {
	INITIAL_CHECKPOINT_STAGE,
	captureStageCorpus,
	hashedCorpus,
	refusedCorpus,
	withLoadedFilesNow,
} from "./checkpoint";
import type { CorpusRoot } from "./corpus-file";
import {
	CORPUS_INSTRUCTIONS_PATH,
	corpusFileRefusal,
	corpusInstructionsEntry,
} from "./corpus-file";
import { currentCorpusReadScope } from "./corpus-read-scope";
import type { CorpusUnderTest } from "./corpus-version";
import { SymlinkedEntryError, refusedEntryReason } from "./file-presence";
import type { RunManifest } from "./manifest";

/**
 * A tree `captureStageCorpus` refuses to hash stales the stage that reads it
 * rather than failing the report: this command and the run-history screen both
 * answer for every recorded run, and one unhashable corpus directory must not
 * take the other runs' answers with it. The refusal carries the entry it
 * names, so the reader can find the link that caused it.
 */
async function hashedOrRefused(
	skill: string,
	instructions: string,
	roots: readonly CorpusRoot[],
): Promise<StageCorpus> {
	try {
		return hashedCorpus(await captureStageCorpus(skill, instructions, roots));
	} catch (error) {
		if (error instanceof SymlinkedEntryError) {
			return refusedCorpus(error.message);
		}

		throw error;
	}
}

/**
 * The instructions a replay would read, or the reason this corpus cannot supply
 * them. A refusal is not a failure of the report: every recorded checkpoint
 * hashed an instruction file into its corpus, so a corpus that cannot produce
 * one invalidates those measurements exactly as an edited file does, and that
 * is a cause the reader is owed rather than an error that takes every other
 * run's answer with it.
 *
 * Every refusal names the layout path alone. `stale` prints these on stdout and
 * the run-history report copies them into its rows, where an absolute path
 * would carry the operator's home directory to every reader.
 */
type CurrentInstructions =
	| { readonly text: string }
	| { readonly refused: string };

async function currentInstructions(
	source: CorpusRoot,
): Promise<CurrentInstructions> {
	const entry = await corpusInstructionsEntry(source);
	if (entry.kind === "absent") {
		return {
			refused: corpusFileRefusal(
				CORPUS_INSTRUCTIONS_PATH,
				"is not in the corpus under test, so a checkpoint that hashed it cannot be compared",
			),
		};
	}
	if (entry.kind === "refused") {
		return { refused: entry.refusal };
	}
	return await readCurrentInstructions(entry.path);
}

/** A stage's corpus in the corpus under test, or why it cannot be hashed. */
async function stageCorpusNow(
	skill: string,
	instructions: CurrentInstructions,
	source: CorpusRoot,
): Promise<StageCorpus> {
	if ("refused" in instructions) {
		return refusedCorpus(instructions.refused);
	}

	const cache = currentCorpusReadScope()?.stages;
	const key = JSON.stringify([source, skill, instructions.text]);
	let pending = cache?.get(key);
	if (pending === undefined) {
		pending = hashedOrRefused(skill, instructions.text, [source]);
		cache?.set(key, pending);
	}

	return await pending;
}

interface RunCorpusHistory {
	readonly manifest: RunManifest;
	readonly chain: readonly StalenessLink[];
}

/**
 * `stale` answers one question per invocation: what the corpus the operator
 * named invalidated. So a live corpus here is the operator's install, not the
 * target each run recorded, even though `replay` resolves the same source
 * against the target it is about to run in. Half this command's subjects are
 * session cases, which carry no manifest and no target at all, so pointing
 * pipeline runs at their own recorded roots would make one command answer two
 * questions depending on what it happened to be looking at.
 */
async function currentStageCorpus(
	{ manifest, chain }: RunCorpusHistory,
	source: CorpusRoot,
	instructions: CurrentInstructions,
): Promise<ReadonlyMap<string, StageCorpus>> {
	const corpus = new Map<string, StageCorpus>();

	await Array.fromAsync(chain, async (record) => {
		if (record.stage === INITIAL_CHECKPOINT_STAGE) {
			return;
		}

		const definition = manifest.pipeline.stages.find(
			({ name }) => name === record.stage,
		);
		if (definition === undefined) {
			return;
		}

		corpus.set(
			record.stage,
			await withLoadedFilesNow(
				await stageCorpusNow(definition.skill, instructions, source),
				record,
				source,
			),
		);
	});

	return corpus;
}

interface CorpusJudgedAgainst {
	readonly source: CorpusRoot;
	readonly instructions: CurrentInstructions;
	readonly underTest: CorpusUnderTest;
}

/** Reads the corpus under test as `readCorpusUnderTest` does. */
type CorpusUnderTestReader = (
	recordsDirectory: string,
	source: CorpusRoot,
) => Promise<CorpusUnderTest>;

async function corpusJudgedAgainst(
	runsDirectory: string,
	source: CorpusRoot,
	readUnderTest: CorpusUnderTestReader,
): Promise<CorpusJudgedAgainst> {
	return {
		instructions: await currentInstructions(source),
		source,
		underTest: await readUnderTest(runsDirectory, source),
	};
}

async function readCurrentInstructions(
	path: string,
): Promise<CurrentInstructions> {
	try {
		return { text: await Bun.file(path).text() };
	} catch (error) {
		const reason =
			error instanceof Error ? refusedEntryReason(error, path) : undefined;
		if (reason === undefined) {
			throw error;
		}

		return { refused: corpusFileRefusal(CORPUS_INSTRUCTIONS_PATH, reason) };
	}
}

export {
	corpusJudgedAgainst,
	currentStageCorpus,
	stageCorpusNow,
	currentInstructions,
};

export type { CorpusUnderTestReader, CorpusJudgedAgainst, CurrentInstructions };
