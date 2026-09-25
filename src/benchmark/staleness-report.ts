import type { CaseDeclaration, SessionCaseDeclaration } from "./case";
import { listCases } from "./case";
import { join } from "node:path";
import type {
	ChangedCorpusFile,
	CheckpointRecord,
	HashedFile,
	StageCorpus,
} from "./checkpoint";
import {
	captureStageCorpus,
	deriveStaleness,
	hashedCorpus,
	INITIAL_CHECKPOINT_STAGE,
	parseCheckpointRecord,
	refusedCorpus,
	readChangedFilesOnly,
	modelCause,
	effortCause,
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
import type { CorpusUnderTest, VersionDistance } from "./corpus-version";
import { readCorpusUnderTest } from "./corpus-version";
import { parseConfirmationGroupRecord } from "./confirmation-record";
import type { ParsedConfirmationGroupRecord } from "./confirmation-record";
import { loadRunManifest } from "./manifest";
import type { RunManifest } from "./manifest";
import { pipelineDefinitionSchema } from "./pipeline";
import type { PipelineDefinition } from "./pipeline";
import {
	benchmarkRunPaths,
	checkpointRecordFile,
	confirmationGroupIds,
	confirmationGroupPaths,
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
	/**
	 * Stale only because corpus files changed, among them one it read, which
	 * is what a reader can count in versions.
	 */
	readonly onlyCorpusFiles: boolean;
	readonly distance: VersionDistance;
	/** The corpus files it read, each with the hash it recorded. */
	readonly readFiles: readonly HashedFile[];
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

/** A stage's corpus in the corpus under test, or why it cannot be hashed. */
function stageCorpusNow(
	skill: string,
	instructions: CurrentInstructions,
	source: CorpusRoot,
): Promise<StageCorpus> {
	if ("refused" in instructions) {
		return Promise.resolve(refusedCorpus(instructions.refused));
	}

	return hashedOrRefused(skill, instructions.text, [source]);
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
			await stageCorpusNow(definition.skill, instructions, source),
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
 * The initial checkpoint freezes the target before any stage reads the
 * corpus, so no version applies to it, whenever its run was recorded.
 */
const INITIAL_CHECKPOINT_DISTANCE: VersionDistance = {
	kind: "not-recorded",
	reason: "the initial checkpoint reads no corpus",
};

/**
 * Staleness needs the corpus hashed, never installed, so `stale` needs no
 * worktree, no git, and no session: `captureStageCorpus` reads the roots it is
 * given and nothing else, and those roots are the ones a replay against the
 * same corpus would search.
 *
 * Every checkpoint of every recorded run, judged against the corpus under
 * test. A run with no manifest contributes nothing rather than failing the
 * report: it was never replayable, so nothing about it can go stale. A run
 * whose manifest or checkpoints do not parse is unreadable under its run id,
 * so one bad record cannot blank every reader of the report.
 *
 * The instruction file is read once for the whole report rather than once per
 * run: the corpus under test does not change between runs, so one read answers
 * for all of them and a refusal is decided in one place.
 */
export async function checkpointStaleness(
	runsDirectory: string,
	source: CorpusRoot,
	knobs: CurrentSessionKnobs = {},
): Promise<StalenessReport> {
	const { byRun, unreadable } = await checkpointStalenessByRun(
		runsDirectory,
		source,
		knobs,
	);

	return { records: [...byRun.values()].flat(), unreadable };
}

export interface CheckpointStalenessByRun {
	/** Each readable run's checkpoints, in chain order. */
	readonly byRun: ReadonlyMap<string, readonly RecordStaleness[]>;
	readonly unreadable: readonly UnreadableStaleRecord[];
}

/** `checkpointStaleness` keyed by run. */
export async function checkpointStalenessByRun(
	runsDirectory: string,
	source: CorpusRoot,
	knobs: CurrentSessionKnobs = {},
): Promise<CheckpointStalenessByRun> {
	const byRun = new Map<string, RecordStaleness[]>();
	const unreadable: UnreadableStaleRecord[] = [];
	const instructions = await currentInstructions(source);
	const underTest = await readCorpusUnderTest(runsDirectory, source);

	for (const run of await recordedRunNames(runsDirectory)) {
		try {
			const judged = await runCheckpointStaleness(
				runsDirectory,
				run,
				{ source, instructions, underTest },
				knobs,
			);
			if (judged !== undefined) {
				byRun.set(run, judged);
			}
		} catch (error) {
			unreadable.push({
				id: `run:${run}`,
				reason: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return { byRun, unreadable };
}

interface CorpusJudgedAgainst {
	readonly source: CorpusRoot;
	readonly instructions: CurrentInstructions;
	readonly underTest: CorpusUnderTest;
}

async function runCheckpointStaleness(
	runsDirectory: string,
	run: string,
	{ source, instructions, underTest }: CorpusJudgedAgainst,
	knobs: CurrentSessionKnobs,
): Promise<RecordStaleness[] | undefined> {
	const paths = benchmarkRunPaths(runsDirectory, run);
	const manifestFile = Bun.file(paths.manifestFile);
	if (!(await manifestFile.exists())) {
		return undefined;
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
	const byStage = new Map(chain.map((record) => [record.stage, record]));
	const judged: RecordStaleness[] = [];

	for (const staleness of deriveStaleness(chain, current, {
		model: knobs.model ?? manifest.model,
		effort: knobs.effort ?? manifest.effort,
		...settings,
	})) {
		judged.push({
			id: `checkpoint:${run}/${staleness.stage}`,
			stale: staleness.stale,
			causes: staleness.causes,
			changedFiles: staleness.changedFiles,
			onlyCorpusFiles: staleness.onlyCorpusFiles,
			distance:
				staleness.stage === INITIAL_CHECKPOINT_STAGE
					? INITIAL_CHECKPOINT_DISTANCE
					: underTest.distanceOf(byStage.get(staleness.stage)?.corpusVersion),
			readFiles: byStage.get(staleness.stage)?.corpusFiles ?? [],
		});
	}

	return judged;
}

/** The readable checkpoints `checkpointStaleness` finds stale, and only those. */
export async function staleCheckpoints(
	runsDirectory: string,
	source: CorpusRoot,
	knobs: CurrentSessionKnobs = {},
): Promise<readonly RecordStaleness[]> {
	const report = await checkpointStaleness(runsDirectory, source, knobs);

	return report.records.filter(({ stale }) => stale);
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

	const known = new Set([
		...listing.declarations.map(({ id }) => id),
		...listing.unreadable.map(({ id }) => id),
	]);
	for (const attempt of attempts) {
		if (!known.has(attempt.caseId)) {
			unreadable.push({
				id: `attempt:session:${attempt.caseId}/${attempt.uuid}`,
				reason: `case ${attempt.caseId} is no longer declared as a session case, so its corpus files are unknown`,
			});
		}
	}

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
				const readFiles = record.corpusFiles.map(({ path, sha256 }) => ({
					path,
					sha256,
				}));
				const changes = stageCorpusChanges(readFiles, current);
				records.push({
					id,
					stale: changes.causes.length > 0,
					...changes,
					onlyCorpusFiles: readChangedFilesOnly(changes),
					distance: underTest.distanceOf(record.corpusVersion),
					readFiles,
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

/**
 * A model or effort the caller names that differs from the one the record ran
 * with. An unnamed knob asserts nothing, as it does for a checkpoint.
 */
function namedKnobCauses(
	record: Pick<ReplayRecord, "model" | "effort">,
	knobs: CurrentSessionKnobs,
): readonly string[] {
	const causes: string[] = [];
	if (knobs.model !== undefined && knobs.model !== record.model) {
		causes.push(modelCause(record.model, knobs.model));
	}
	if (knobs.effort !== undefined && knobs.effort !== record.effort) {
		causes.push(effortCause(record.effort, knobs.effort));
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

	return stageCorpusNow(definition.skill, instructions, source);
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
	const upstream = await checkpointStaleness(runsDirectory, source);
	const staleCheckpointsById = new Map(
		upstream.records
			.filter(({ stale }) => stale)
			.map((checkpoint) => [checkpoint.id, checkpoint]),
	);
	const unreadableRuns = new Set(upstream.unreadable.map(({ id }) => id));
	const records: RecordStaleness[] = [];
	const unreadable: UnreadableStaleRecord[] = [];

	for (const { lineage, timestamp } of await replayAttemptIds(runsDirectory)) {
		const id = `attempt:stage:${lineage}/${timestamp}`;

		try {
			const record = await readReplayRecord(
				replayRecordFile(runsDirectory, lineage, timestamp),
			);
			if (unreadableRuns.has(`run:${record.runName}`)) {
				throw new Error(
					`the run ${record.runName} it replayed cannot be read to judge its upstream stages`,
				);
			}
			const corpus = stageCorpusChanges(
				record.corpusFiles,
				await currentReplayCorpus(runsDirectory, record, source, instructions),
			);
			const consumed = staleCheckpointsById.get(
				`checkpoint:${record.runName}/${record.consumed.stage}`,
			);
			const knobCauses = namedKnobCauses(record, knobs);
			const causes = [
				...(consumed === undefined
					? []
					: [`upstream stage ${record.consumed.stage} is stale`]),
				...knobCauses,
				...corpus.causes,
			];
			records.push({
				id,
				stale: causes.length > 0,
				causes,
				changedFiles: corpus.changedFiles,
				onlyCorpusFiles:
					knobCauses.length === 0 &&
					(consumed?.onlyCorpusFiles ?? true) &&
					readChangedFilesOnly(corpus),
				distance: underTest.distanceOf(record.corpusVersion),
				readFiles: record.corpusFiles,
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

const FROZEN_CORPUS = "inputs/corpus/";

type CorpusChanges = Pick<RecordStaleness, "causes" | "changedFiles">;

type GroupCorpus = CorpusChanges & Pick<RecordStaleness, "readFiles">;

type FrozenGroupFile = ParsedConfirmationGroupRecord["inputs"]["files"][number];

/** The frozen corpus files under one prefix, by the layout path each holds. */
function frozenCorpusFiles(
	files: readonly FrozenGroupFile[],
	prefix: string,
): readonly HashedFile[] {
	return files
		.filter(({ kind, path }) => kind === "corpus" && path.startsWith(prefix))
		.map(({ path, sha256 }) => ({ path: path.slice(prefix.length), sha256 }));
}

/**
 * A group freezes one corpus per stage, and a file every stage reads, the
 * instructions for one, sits in each of them. The reader is owed one line per
 * file, so a file that changed under several stages is named once.
 */
function mergedChanges(changes: readonly CorpusChanges[]): CorpusChanges {
	const causes = new Set(changes.flatMap((change) => change.causes));
	const changedFiles = new Map(
		changes.flatMap((change) =>
			change.changedFiles.map((file) => [file.path, file] as const),
		),
	);

	return {
		causes: [...causes].toSorted(),
		changedFiles: [...changedFiles.values()].toSorted((first, second) =>
			first.path.localeCompare(second.path),
		),
	};
}

async function frozenPipeline(
	groupDirectory: string,
	files: readonly FrozenGroupFile[],
): Promise<PipelineDefinition> {
	const frozen = files.find(({ kind }) => kind === "pipeline");
	if (frozen === undefined) {
		throw new Error("the group froze no pipeline to hash its stages against");
	}

	return pipelineDefinitionSchema.parse(
		JSON.parse(await Bun.file(join(groupDirectory, frozen.path)).text()),
	);
}

/**
 * A stage or pipeline group is judged per stage it froze, against the skill
 * its frozen pipeline names for that stage, so a later edit to the case's
 * pipeline does not change what the group is compared with.
 */
async function stageGroupChanges(
	groupDirectory: string,
	files: readonly FrozenGroupFile[],
	source: CorpusRoot,
	instructions: CurrentInstructions,
): Promise<GroupCorpus> {
	const pipeline = await frozenPipeline(groupDirectory, files);
	const changes: CorpusChanges[] = [];
	const readFiles: HashedFile[] = [];

	for (const stage of pipeline.stages) {
		const recorded = frozenCorpusFiles(files, `${FROZEN_CORPUS}${stage.name}/`);
		if (recorded.length === 0) {
			continue;
		}

		readFiles.push(...recorded);
		changes.push(
			stageCorpusChanges(
				recorded,
				await stageCorpusNow(stage.skill, instructions, source),
			),
		);
	}

	return { ...mergedChanges(changes), readFiles };
}

async function sessionGroupChanges(
	caseId: string,
	files: readonly FrozenGroupFile[],
	source: CorpusRoot,
): Promise<GroupCorpus> {
	const listing = await listCases();
	const declaration = sessionCases(listing.declarations).find(
		({ id }) => id === caseId,
	);
	if (declaration === undefined) {
		throw new Error(
			`case ${caseId} is no longer declared as a session case, so its corpus files are unknown`,
		);
	}

	const readFiles = frozenCorpusFiles(files, FROZEN_CORPUS);

	return {
		...stageCorpusChanges(
			readFiles,
			await currentCaseCorpus(declaration, source),
		),
		readFiles,
	};
}

/**
 * Every confirmation group judged against the corpus under test by the corpus
 * files it froze. A group froze its checkpoint and pipeline too, so nothing
 * upstream of it in the live run records can stale it, and its settings are
 * compared by the checkpoint it froze rather than here.
 */
export async function groupStaleness(
	runsDirectory: string,
	source: CorpusRoot,
	knobs: CurrentSessionKnobs = {},
): Promise<StalenessReport> {
	const instructions = await currentInstructions(source);
	const underTest = await readCorpusUnderTest(runsDirectory, source);
	const records: RecordStaleness[] = [];
	const unreadable: UnreadableStaleRecord[] = [];

	for (const groupId of await confirmationGroupIds(runsDirectory)) {
		const id = `group:${groupId}`;
		const paths = confirmationGroupPaths(runsDirectory, groupId);
		const text = await textIfPresent(paths.groupFile);
		if (text === undefined) {
			continue;
		}

		try {
			const record = parseConfirmationGroupRecord(text);
			const corpus =
				record.mode === "session"
					? await sessionGroupChanges(
							record.caseId,
							record.inputs.files,
							source,
						)
					: await stageGroupChanges(
							paths.directory,
							record.inputs.files,
							source,
							instructions,
						);
			const knobCauses = namedKnobCauses(record.inputs, knobs);
			const causes = [...knobCauses, ...corpus.causes];
			records.push({
				id,
				stale: causes.length > 0,
				causes,
				changedFiles: corpus.changedFiles,
				onlyCorpusFiles:
					knobCauses.length === 0 && readChangedFilesOnly(corpus),
				distance: underTest.distanceOf(record.inputs.corpusVersion),
				readFiles: corpus.readFiles,
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
