import type { CaseDeclaration, SessionCaseDeclaration } from "./case";
import { listCases } from "./case";
import type {
	ChangedCorpusFile,
	CheckpointRecord,
	StageCorpus,
} from "./checkpoint";
import {
	captureStageCorpus,
	deriveStaleness,
	hashedCorpus,
	INITIAL_CHECKPOINT_STAGE,
	parseCheckpointRecord,
	refusedCorpus,
	stageCorpusChanges,
} from "./checkpoint";
import {
	refusedEntryReason,
	SymlinkedEntryError,
	textIfPresent,
} from "./file-presence";
import type { Effort } from "./config";
import { compareCurrentStageSettings } from "./current-stage-settings";
import type { CorpusRoot } from "./corpus-file";
import {
	CORPUS_INSTRUCTIONS_PATH,
	CorpusFileError,
	corpusFileRefusal,
	corpusInstructionsEntry,
	hashCorpusFiles,
} from "./corpus-file";
import type { VersionDistance } from "./corpus-version";
import { readCorpusUnderTest } from "./corpus-version";
import { loadRunManifest } from "./manifest";
import type { RunManifest } from "./manifest";
import {
	benchmarkRunPaths,
	checkpointRecordFile,
	recordedRunNames,
	replayAttemptIds,
	replayRecordFile,
	sessionAttemptIds,
	sessionAttemptPaths,
} from "./run-layout";
import { readReplayRecord } from "./replay-record";
import type { ReplayRecord } from "./replay-record";
import { parseSessionAttemptRecord } from "./session-record";

/**
 * One record judged against the corpus under test, stale or clean, with the
 * corpus files it read that changed and how many versions behind it sits.
 * Stale or clean comes from the causes, never from the distance.
 */
export interface RecordStaleness {
	/** The id `show` accepts back. */
	readonly id: string;
	readonly stale: boolean;
	/** Every reason it went stale, empty when it is clean. */
	readonly causes: readonly string[];
	readonly changedFiles: readonly ChangedCorpusFile[];
	readonly distance: VersionDistance;
}

export interface UnreadableStaleRecord {
	readonly id: string;
	readonly reason: string;
}

export interface StalenessReport {
	readonly records: readonly RecordStaleness[];
	readonly unreadable: readonly UnreadableStaleRecord[];
}

/**
 * The model and effort the session is about to replay with, which is what a
 * recorded checkpoint is compared against. Comparing a checkpoint to the
 * manifest that produced it answers the question tautologically, so a knob the
 * caller did not name asserts nothing: the run's own value stands in and that
 * half of the comparison stays silent, while a named one reports exactly what
 * `replay` would report for the same flags.
 */
export interface CurrentSessionKnobs {
	readonly model?: string | undefined;
	readonly effort?: Effort | undefined;
}

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

	try {
		return { text: await Bun.file(entry.path).text() };
	} catch (error) {
		const reason =
			error instanceof Error
				? refusedEntryReason(error, entry.path)
				: undefined;
		if (reason === undefined) {
			throw error;
		}

		return { refused: corpusFileRefusal(CORPUS_INSTRUCTIONS_PATH, reason) };
	}
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
	manifest: RunManifest,
	chain: readonly CheckpointRecord[],
	source: CorpusRoot,
	instructions: CurrentInstructions,
): Promise<ReadonlyMap<string, StageCorpus>> {
	const corpus = new Map<string, StageCorpus>();
	const roots = [source];

	for (const record of chain) {
		if (record.stage === INITIAL_CHECKPOINT_STAGE) {
			continue;
		}

		const definition = manifest.pipeline.stages.find(
			({ name }) => name === record.stage,
		);
		if (definition === undefined) {
			continue;
		}

		corpus.set(
			record.stage,
			"refused" in instructions
				? refusedCorpus(instructions.refused)
				: await hashedOrRefused(definition.skill, instructions.text, roots),
		);
	}

	return corpus;
}

async function checkpointChain(
	runsDirectory: string,
	run: string,
	stages: readonly string[],
): Promise<readonly CheckpointRecord[]> {
	const paths = benchmarkRunPaths(runsDirectory, run);
	const chain: CheckpointRecord[] = [];

	for (const stage of stages) {
		const file = Bun.file(
			checkpointRecordFile(paths.checkpointDirectory(stage)),
		);
		if (await file.exists()) {
			chain.push(parseCheckpointRecord(await file.text()));
		}
	}

	return chain;
}

/**
 * Staleness needs the corpus hashed, never installed, so `stale` needs no
 * worktree, no git, and no session: `captureStageCorpus` reads the roots it is
 * given and nothing else, and those roots are the ones a replay against the
 * same corpus would search.
 *
 * Every checkpoint of every recorded run, judged against the corpus under
 * test. A run whose manifest cannot be read contributes
 * nothing rather than failing the report: it was never replayable, so nothing
 * about it can go stale.
 *
 * The instruction file is read once for the whole report rather than once per
 * run: the corpus under test does not change between runs, so one read answers
 * for all of them and a refusal is decided in one place.
 */
export async function checkpointStaleness(
	runsDirectory: string,
	source: CorpusRoot,
	knobs: CurrentSessionKnobs = {},
): Promise<readonly RecordStaleness[]> {
	const report: RecordStaleness[] = [];
	const instructions = await currentInstructions(source);
	const underTest = await readCorpusUnderTest(runsDirectory, source);

	for (const run of await recordedRunNames(runsDirectory)) {
		const paths = benchmarkRunPaths(runsDirectory, run);
		const manifestFile = Bun.file(paths.manifestFile);
		if (!(await manifestFile.exists())) {
			continue;
		}

		const manifest = await loadRunManifest(paths.manifestFile);
		const chain = await checkpointChain(runsDirectory, run, [
			INITIAL_CHECKPOINT_STAGE,
			...manifest.pipeline.stages.map(({ name }) => name),
		]);
		const current = await currentStageCorpus(
			manifest,
			chain,
			source,
			instructions,
		);
		const settings = await compareCurrentStageSettings(manifest.caseId);
		const versionByStage = new Map(
			chain.map(({ stage, corpusVersion }) => [stage, corpusVersion]),
		);

		for (const staleness of deriveStaleness(chain, current, {
			model: knobs.model ?? manifest.model,
			effort: knobs.effort ?? manifest.effort,
			...settings,
		})) {
			report.push({
				id: `checkpoint:${run}/${staleness.stage}`,
				stale: staleness.stale,
				causes: staleness.causes,
				changedFiles: staleness.changedFiles,
				distance: underTest.distanceOf(versionByStage.get(staleness.stage)),
			});
		}
	}

	return report;
}

/** The checkpoints `checkpointStaleness` finds stale, and only those. */
export async function staleCheckpoints(
	runsDirectory: string,
	source: CorpusRoot,
	knobs: CurrentSessionKnobs = {},
): Promise<readonly RecordStaleness[]> {
	const report = await checkpointStaleness(runsDirectory, source, knobs);

	return report.filter(({ stale }) => stale);
}

function sessionCases(
	declarations: readonly CaseDeclaration[],
): readonly SessionCaseDeclaration[] {
	return declarations.filter(
		(declaration): declaration is SessionCaseDeclaration =>
			declaration.kind === "session",
	);
}

/**
 * The corpus root stripped back out of a message built for a caller that
 * throws. `resolveCorpusFile` names the resolved path so an operator reading a
 * refusal on stderr can find the file; the same string on stdout would carry
 * the operator's home directory into a record every reader of `stale` sees.
 */
function withoutAbsolutePaths(message: string, source: CorpusRoot): string {
	return message.replaceAll(`${source.root}/`, "");
}

/**
 * The declared files as the corpus under test holds them now, or why it
 * cannot hold them. A declared corpus file the corpus under test no longer
 * holds invalidates the measurement as surely as an edit does, the case cannot
 * even run against this corpus, so it is a cause rather than a failure that
 * hides every other case's answer.
 *
 * The cause names the layout path alone. A refusal built for a caller that
 * throws carries the resolved path, which helps an operator reading a refusal
 * on stderr and leaks the corpus root into the record ids and causes this
 * command prints on stdout, where a reader acts on the layout path anyway.
 */
async function currentCaseCorpus(
	declaration: SessionCaseDeclaration,
	source: CorpusRoot,
): Promise<StageCorpus> {
	try {
		const current = await hashCorpusFiles(source, declaration.corpusFiles);

		return hashedCorpus(current.map(({ path, sha256 }) => ({ path, sha256 })));
	} catch (error) {
		if (
			error instanceof CorpusFileError ||
			error instanceof SymlinkedEntryError
		) {
			return refusedCorpus(withoutAbsolutePaths(error.message, source));
		}

		throw error;
	}
}

/**
 * Every session attempt judged against the corpus under test, each on its
 * own: an older attempt of a case is a result on the run history as much as
 * the newest one, and its distance differs. An attempt is stale when a corpus
 * file its case declares changed since it was recorded.
 *
 * A record that does not read is named rather than dropped, since one
 * half-written attempt must not hide every other answer. So is a declaration
 * that does not read: silence there is indistinguishable from fresh, and a
 * mistyped `corpusFiles` entry would then read as an answer.
 */
export async function sessionAttemptStaleness(
	runsDirectory: string,
	source: CorpusRoot,
): Promise<StalenessReport> {
	const listing = await listCases();
	const underTest = await readCorpusUnderTest(runsDirectory, source);
	const attempts = await sessionAttemptIds(runsDirectory);
	const records: RecordStaleness[] = [];
	const unreadable: UnreadableStaleRecord[] = listing.unreadable.map(
		({ id, reason }) => ({ id: `case:${id}`, reason }),
	);

	for (const declaration of sessionCases(listing.declarations)) {
		const current = await currentCaseCorpus(declaration, source);

		for (const attempt of attempts) {
			if (attempt.caseId !== declaration.id) {
				continue;
			}

			const id = `attempt:session:${attempt.caseId}/${attempt.uuid}`;
			const text = await textIfPresent(
				sessionAttemptPaths(runsDirectory, attempt).recordFile,
			);
			if (text === undefined) {
				continue;
			}

			try {
				const record = parseSessionAttemptRecord(text);
				const changes = stageCorpusChanges(
					record.corpusFiles.map(({ path, sha256 }) => ({ path, sha256 })),
					current,
				);
				records.push({
					id,
					stale: changes.causes.length > 0,
					...changes,
					distance: underTest.distanceOf(record.corpusVersion),
				});
			} catch (error) {
				unreadable.push({
					id,
					reason: error instanceof Error ? error.message : String(error),
				});
			}
		}
	}

	return { records, unreadable };
}

function replayKnobCauses(
	record: Pick<ReplayRecord, "model" | "effort">,
	knobs: CurrentSessionKnobs,
): readonly string[] {
	const causes: string[] = [];
	if (knobs.model !== undefined && knobs.model !== record.model) {
		causes.push(`model ${record.model} is now ${knobs.model}`);
	}
	if (knobs.effort !== undefined && knobs.effort !== record.effort) {
		causes.push(`effort ${record.effort ?? "none"} is now ${knobs.effort}`);
	}

	return causes;
}

async function currentReplayCorpus(
	runsDirectory: string,
	record: Pick<ReplayRecord, "runName" | "stage">,
	source: CorpusRoot,
	instructions: CurrentInstructions,
): Promise<StageCorpus> {
	const manifest = await loadRunManifest(
		benchmarkRunPaths(runsDirectory, record.runName).manifestFile,
	);
	const definition = manifest.pipeline.stages.find(
		({ name }) => name === record.stage,
	);
	if (definition === undefined) {
		throw new Error(
			`the run's pipeline does not declare the ${record.stage} stage it replayed`,
		);
	}
	if ("refused" in instructions) {
		return refusedCorpus(instructions.refused);
	}

	return hashedOrRefused(definition.skill, instructions.text, [source]);
}

/**
 * Every stage replay judged against the corpus under test. A replay is stale
 * when a corpus file its stage read changed, when the checkpoint it consumed
 * went stale, or when the caller names a model or effort it did not run with.
 * The consumed checkpoint is judged with its own run's knobs: a knob the
 * caller names is compared against the replay's own value once, rather than
 * again through every checkpoint upstream of it. A settings change needs no
 * cause of its own here, since it stales the consumed checkpoint and reaches
 * the replay as that upstream cause.
 */
export async function replayAttemptStaleness(
	runsDirectory: string,
	source: CorpusRoot,
	knobs: CurrentSessionKnobs = {},
): Promise<StalenessReport> {
	const instructions = await currentInstructions(source);
	const underTest = await readCorpusUnderTest(runsDirectory, source);
	const upstream = await staleCheckpoints(runsDirectory, source);
	const staleCheckpointIds = new Set(upstream.map(({ id }) => id));
	const records: RecordStaleness[] = [];
	const unreadable: UnreadableStaleRecord[] = [];

	for (const { lineage, timestamp } of await replayAttemptIds(runsDirectory)) {
		const id = `attempt:stage:${lineage}/${timestamp}`;

		try {
			const record = await readReplayRecord(
				replayRecordFile(runsDirectory, lineage, timestamp),
			);
			const corpus = stageCorpusChanges(
				record.corpusFiles,
				await currentReplayCorpus(runsDirectory, record, source, instructions),
			);
			const consumed = `checkpoint:${record.runName}/${record.consumed.stage}`;
			const causes = [
				...(staleCheckpointIds.has(consumed)
					? [`upstream stage ${record.consumed.stage} is stale`]
					: []),
				...replayKnobCauses(record, knobs),
				...corpus.causes,
			];
			records.push({
				id,
				stale: causes.length > 0,
				causes,
				changedFiles: corpus.changedFiles,
				distance: underTest.distanceOf(record.corpusVersion),
			});
		} catch (error) {
			unreadable.push({
				id,
				reason: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return { records, unreadable };
}
