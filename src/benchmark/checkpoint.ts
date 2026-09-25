import { createHash } from "node:crypto";
import type { Stats } from "node:fs";
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import { z } from "zod";
import type { Effort } from "./config";
import { effortSchema } from "./config";
import type { CorpusRoot, LiveCorpusRoot } from "./corpus-file";
import {
	CORPUS_LAYOUT_DIRECTORIES,
	readCorpusInstructions,
	resolvesOutside,
	resolvesOutsideCorpus,
} from "./corpus-file";
import type { Immutable } from "./contracts";
import type { CorpusMeasurement } from "./corpus-measurement";
import { corpusMeasurementSchema } from "./corpus-measurement";
import { projectSlug } from "./session-capture";
import {
	classifyEntry,
	lstatIfPresent,
	refusedEntryReason,
	statIfExists,
	SymlinkedEntryError,
} from "./file-presence";
import { copyWorkflowState, existingWorkflowEntries } from "./workflow-state";

export interface HashedFile {
	readonly path: string;
	readonly sha256: string;
}

export interface WalkedDirectory {
	readonly files: readonly HashedFile[];
	readonly refusals: readonly SymlinkedEntryError[];
}

export interface LineageInputs {
	readonly upstream: string;
	readonly corpusFiles: readonly HashedFile[];
	readonly model: string;
	readonly effort?: Effort | undefined;
	readonly settingsFile?: HashedFile | undefined;
}

/**
 * Where the provider writes a session's transcript: one file per session id,
 * under a slug derived from the working directory. Session attempts already
 * resolve it this way; a stage knows both halves by the time it checkpoints.
 */
export interface StageTranscriptSource {
	readonly sessionId: string;
	readonly projectsDirectory: string;
}

export interface RootLineageInputs {
	readonly taskSha: string;
	readonly task: string;
	readonly productBrief: string;
	readonly workflowFiles: readonly HashedFile[];
}

function sha256(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

// Codepoint order, never locale collation: the lineage key must hash the
// same bytes on every machine, and locale-aware sorting varies with the
// host's collation rules.
export function canonicalFiles(files: readonly HashedFile[]): HashedFile[] {
	return files
		.toSorted((left, right) => {
			if (left.path < right.path) {
				return -1;
			}
			if (left.path > right.path) {
				return 1;
			}
			return 0;
		})
		.map((file) => ({ path: file.path, sha256: file.sha256 }));
}

/**
 * The key hashes exactly the inputs the design names — upstream checkpoint,
 * corpus files feeding the stage, model, effort — so a checkpoint is
 * invalidated when and only when one of them changes. Nothing else may enter
 * this object: an extra field would invalidate checkpoints spuriously.
 */
export function lineageKey(inputs: LineageInputs): string {
	return sha256(
		JSON.stringify({
			upstream: inputs.upstream,
			corpusFiles: canonicalFiles(inputs.corpusFiles),
			model: inputs.model,
			effort: inputs.effort ?? null,
			settingsFile: inputs.settingsFile ?? null,
		}),
	);
}

export async function hashFile(path: string): Promise<string> {
	return createHash("sha256")
		.update(await Bun.file(path).bytes())
		.digest("hex");
}

const ESCAPES_TREE_REASON =
	"resolves outside the tree it is named under, so its bytes are not the ones that tree holds";

/**
 * The path is named the way the hashes are, `join(prefix, entry)`, because the
 * corpus screen redacts the absolute root before a reader sees the message. An
 * entry named alone leaves that reader knowing something called `escape.md` is
 * a link, with no way to tell which layout directory holds it.
 */
function symlinkedEntry(path: string): SymlinkedEntryError {
	return refusedEntry(path, ESCAPES_TREE_REASON);
}

/**
 * A refusal naming the entry and the reason it was refused for, so every
 * refusal in one list reads as one kind of statement whether the entry escaped
 * the tree or could not be read at all.
 */
function refusedEntry(path: string, reason: string): SymlinkedEntryError {
	return new SymlinkedEntryError(`${path} ${reason}`);
}

type Probed<Value> = { readonly value: Value } | { readonly reason: string };

/**
 * A probe of one entry whose failure this walk can name. Classifying the entry
 * is not enough on its own: resolving where it leads and reading its bytes both
 * touch the entry again, and a filesystem may refuse either after allowing the
 * `stat` pair. An unreadable regular file has been observed answering `lstat`
 * and `stat` and then refusing `realpath`, so a code `refusedEntryReason` knows
 * becomes this entry's refusal wherever it surfaces, as long as the failure is
 * about this entry and not about something else the probe had to consult.
 */
async function probed<Value>(
	path: string,
	work: () => Promise<Value>,
): Promise<Probed<Value>> {
	try {
		return { value: await work() };
	} catch (error) {
		const reason =
			error instanceof Error ? refusedEntryReason(error, path) : undefined;
		if (reason === undefined) {
			throw error;
		}

		return { reason };
	}
}

/**
 * Every path under the tree, relative to it, or the refusal listing them
 * raised. A recursive listing opens each entry to decide whether to descend, so
 * one self-referential link refuses the listing whole and no per-entry check
 * ever runs: the tree is enumerated or it is not.
 *
 * The refusal names the entry the failure identifies, since that is the file
 * whoever reads it has to go fix, and falls back to the tree when the failure
 * names nothing under it. Unlike an entry refused mid-walk, this one takes its
 * tree's files with it, because a listing that failed reports no file at all:
 * the digest is withheld for either refusal, so neither serves a partial tree
 * as a whole one.
 */
async function listedEntries(
	root: string,
	prefix: string,
): Promise<Probed<string[]>> {
	try {
		return { value: await readdir(root, { recursive: true }) };
	} catch (error) {
		if (!(error instanceof Error)) {
			throw error;
		}

		const reason = refusedEntryReason(error, undefined);
		if (reason === undefined) {
			throw error;
		}

		return { reason: `${listedEntryPath(error, root, prefix)} ${reason}` };
	}
}

function listedEntryPath(
	error: Readonly<Error>,
	root: string,
	prefix: string,
): string {
	const path = "path" in error ? String(error.path) : "";
	const entry = path.startsWith(`${root}${sep}`)
		? relative(root, path)
		: undefined;

	return entry === undefined ? prefix || root : join(prefix, entry);
}

async function refuseIfLink(root: string, prefix: string): Promise<void> {
	const stats = await lstatIfPresent(root);
	if (stats?.isSymbolicLink() === true) {
		throw symlinkedEntry(prefix === "" ? root : prefix);
	}
}

/**
 * What one listed entry contributes: bytes under its own path, a refusal the
 * walk names it by, or nothing. A directory is skipped because the listing
 * already carries its children, and anything that is neither a directory nor a
 * regular file holds no bytes to hash.
 */
type WalkedEntry =
	| { readonly skipped: true }
	| { readonly refused: string }
	| { readonly sha256: string };

async function walkedEntry(
	root: string,
	absolute: string,
	options: DirectoryWalkOptions,
): Promise<WalkedEntry> {
	const classified = await classifyEntry(absolute);
	if (classified.kind === "absent") {
		return { skipped: true };
	}
	if (classified.kind === "refused") {
		return { refused: classified.reason };
	}

	const outside = await probed(absolute, () =>
		"source" in options
			? resolvesOutsideCorpus(options.source, absolute)
			: resolvesOutside(root, absolute),
	);
	if ("reason" in outside) {
		return { refused: outside.reason };
	}
	if (outside.value) {
		return { refused: ESCAPES_TREE_REASON };
	}
	if (classified.kind !== "file") {
		return { skipped: true };
	}

	const hashed = await probed(absolute, () => hashFile(absolute));

	return "reason" in hashed
		? { refused: hashed.reason }
		: { sha256: hashed.value };
}

type DirectoryWalkOptions =
	| { readonly source: CorpusRoot }
	| { readonly rootMayBeALink: boolean };

/**
 * `walkDirectory` for a caller that refuses the whole tree on any refusal, so
 * the first one is the only one that changes its outcome.
 */
export async function hashDirectory(
	root: string,
	prefix: string,
	options: DirectoryWalkOptions,
): Promise<HashedFile[]> {
	const { files, refusals } = await walkDirectory(root, prefix, options);

	const [first] = refusals;
	if (first !== undefined) {
		throw first;
	}

	return [...files];
}

/**
 * An entry whose resolved path leaves the walked tree is refused, because
 * `readdir` follows a link: it lists the link's descendants as ordinary entries
 * under the link's own relative path, so hashing them reads bytes from outside
 * the tree the caller named and files them under a path that claims they are
 * inside it. Skipping the link alone does not stop that, since the descendants
 * are listed under their own paths and report no link of their own. Resolving
 * every component is what sees it, because the link may be the entry or any
 * directory above it, and a link that resolves back inside the tree is followed
 * rather than refused: nothing escapes, and a corpus may link within itself.
 *
 * A link whose target is gone resolves to nothing, so it is refused too, under
 * its own message: the walk that skipped it would report a lineage as complete
 * while a declared file was never hashed, and a reader told it escaped the tree
 * would go looking for a leak that is not there.
 *
 * Corpus walks carry the source permission for both the root and its entries.
 * Generic fixture/workflow walks retain their walked-tree boundary and explicit
 * root-link policy; a live backing tree never grants permission to those inputs.
 *
 * Both a checkpoint's workflow state and a session case's fixture hash through
 * here, because two copies of this walk could disagree about ordering or about
 * what counts as a file, and a lineage key that differs by walk is a stale
 * checkpoint nobody can explain.
 *
 * Every refused entry is reported rather than the first, because a caller that
 * displays them needs all of them: one benign entry sorting before a hostile
 * one would otherwise hide it, and whoever plants the hostile one chooses both
 * names. A refused entry's descendants are skipped, since naming each of them
 * would put the outside tree's filenames in a message whose purpose is not to
 * report what the link points at.
 *
 * An entry `readdir` lists but that no longer exists by the time this walk
 * reaches it is skipped rather than thrown: a frozen snapshot this function's
 * other callers hash never loses a file mid-walk, so this tolerance is a no-op
 * for them, but the live corpus root the corpus screen hashes is a directory
 * another process can still be writing to.
 *
 * An entry whose bytes cannot be read at all is refused by name too, for the
 * reason the escaping and missing-target entries are: a caller that displays
 * refusals can name the file that broke the tree, and the digest is withheld
 * either way, so a partial tree is never served as a whole one. This walk used
 * to fail entirely on that entry, to keep a raw `EACCES` carrying an absolute
 * path from replacing a named refusal; naming it removes that reason, and no
 * refusal can hide another because every one of them is reported.
 *
 * A failure this cannot name still fails the walk, and a refusal already found
 * outranks it, since which of the two a caller saw would otherwise turn on
 * where they sat in sorted order.
 */
export async function walkDirectory(
	root: string,
	prefix: string,
	options: DirectoryWalkOptions,
): Promise<WalkedDirectory> {
	if ("source" in options) {
		if (await resolvesOutsideCorpus(options.source, root)) {
			throw symlinkedEntry(prefix);
		}
	} else if (!options.rootMayBeALink) {
		await refuseIfLink(root, prefix);
	}

	const listed = await listedEntries(root, prefix);
	if ("reason" in listed) {
		return {
			files: [],
			refusals: [new SymlinkedEntryError(listed.reason)],
		};
	}

	const files: HashedFile[] = [];
	const refusals: SymlinkedEntryError[] = [];
	const refused: string[] = [];

	try {
		for (const entry of listed.value.toSorted()) {
			if (refused.some((above) => entry.startsWith(`${above}${sep}`))) {
				continue;
			}

			const walked = await walkedEntry(root, join(root, entry), options);
			if ("skipped" in walked) {
				continue;
			}
			if ("refused" in walked) {
				refusals.push(refusedEntry(join(prefix, entry), walked.refused));
				refused.push(entry);
				continue;
			}

			files.push({
				path: join(prefix, entry),
				sha256: walked.sha256,
			});
		}
	} catch (error) {
		const [first] = refusals;
		if (first === undefined) {
			throw error;
		}

		throw first;
	}

	return { files, refusals };
}

/**
 * A layout root holds `skills/`, `agents/`, and `output-styles/` as siblings,
 * the shape a `.claude` directory has whether it belongs to a project or a
 * user. Project level is searched before user level, so a stage session
 * reads the frozen bytes a worktree's project-level `.claude` carries before
 * falling back to whatever is live at user level.
 */
export function corpusLayoutRoots(
	targetDir: string,
	source: LiveCorpusRoot,
): readonly CorpusRoot[] {
	return [{ kind: "directory", root: join(targetDir, ".claude") }, source];
}

/**
 * Where a stage's corpus lives for one corpus source, so `stale` and `replay`
 * cannot disagree about whether the same checkpoint is stale. The live
 * install is the pair `corpusLayoutRoots` already searches against the
 * target under test, project level first; a resolved directory or render is
 * the whole corpus, so nothing outside it may shadow what it holds.
 */
export function stageCorpusRoots(
	source: CorpusRoot,
	targetRoot: string,
): readonly CorpusRoot[] {
	return source.kind === "live"
		? corpusLayoutRoots(targetRoot, source)
		: [source];
}

interface CorpusDirectory {
	readonly source: CorpusRoot;
	readonly layoutPath: string;
}

/**
 * A layout directory that loops or cannot be read is refused by name, as an
 * entry escaping the tree is, so a staleness reader can judge against it.
 */
async function layoutDirectoryStats(
	directory: string,
	layoutPath: string,
): Promise<Stats | undefined> {
	try {
		return await statIfExists(directory);
	} catch (error) {
		const reason =
			error instanceof Error ? refusedEntryReason(error, directory) : undefined;
		if (reason === undefined) {
			throw error;
		}

		throw refusedEntry(layoutPath, reason);
	}
}

async function resolveLayoutDirectory(
	layoutPath: string,
	roots: readonly CorpusRoot[],
): Promise<CorpusDirectory | undefined> {
	for (const source of roots) {
		const directory = join(source.root, layoutPath);
		const directoryStats = await layoutDirectoryStats(directory, layoutPath);
		if (directoryStats?.isDirectory() === true) {
			if (await resolvesOutsideCorpus(source, directory)) {
				throw symlinkedEntry(layoutPath);
			}

			return { source, layoutPath };
		}
	}

	return undefined;
}

async function resolveSkill(
	skill: string,
	roots: readonly CorpusRoot[],
): Promise<CorpusDirectory> {
	const directory = await resolveLayoutDirectory(join("skills", skill), roots);
	if (directory !== undefined) {
		return directory;
	}

	throw new Error(
		`The ${skill} skill is not installed; searched ${roots.map(({ root }) => root).join(", ")}`,
	);
}

export async function resolveSkillDirectory(
	skill: string,
	roots: readonly CorpusRoot[],
): Promise<string> {
	const { source, layoutPath } = await resolveSkill(skill, roots);
	return join(source.root, layoutPath);
}

/**
 * Skills every stage reads regardless of which skill it invokes, so an edit
 * to one changes every stage's corpus. A declared list: adding another global
 * skill later is one entry here. The doctrine left this list when it became a
 * rules file, which `rulebook` now carries whole.
 */
export const GLOBAL_SKILLS: readonly string[] = [];

/**
 * The whole-directory corpus kinds a stage's corpus carries beside its skills:
 * every agent, every output style, and every rule, whichever root supplies
 * them, because a stage session can read any of them and all must be frozen
 * the same way a skill is. Rules are a directory of files rather than a named
 * unit like a skill, so a stage reads them by path and the whole tree is
 * frozen.
 */
const LAYOUT_DIRECTORY_KINDS: readonly string[] = [
	"agents",
	"output-styles",
	"rulebook",
];

/**
 * Corpus file paths are recorded relative to the corpus, not the machine, so
 * the same skill bytes produce the same lineage wherever they are installed.
 * The global skills join every stage's corpus beside the installed
 * instructions, because every stage reads them. Agents and output styles join
 * it too, whole, from the first root that has them: a stage session's skill
 * can invoke either, and both must be frozen along with the skill it invokes.
 */
async function stageCorpusDirectories(
	skill: string,
	roots: readonly CorpusRoot[],
): Promise<readonly CorpusDirectory[]> {
	const directories: CorpusDirectory[] = [];
	for (const kind of LAYOUT_DIRECTORY_KINDS) {
		const directory = await resolveLayoutDirectory(kind, roots);
		if (directory !== undefined) {
			directories.push(directory);
		}
	}

	for (const name of new Set([...GLOBAL_SKILLS, skill])) {
		directories.push(await resolveSkill(name, roots));
	}

	return directories;
}

interface CapturedCorpusFile {
	readonly source: CorpusRoot;
	readonly file: HashedFile;
}

async function captureDirectories(
	directories: readonly CorpusDirectory[],
): Promise<readonly CapturedCorpusFile[]> {
	const files: CapturedCorpusFile[] = [];
	for (const { source, layoutPath } of directories) {
		const hashed = await hashDirectory(
			join(source.root, layoutPath),
			layoutPath,
			{ source },
		);
		files.push(...hashed.map((file) => ({ source, file })));
	}

	return files;
}

export async function captureStageCorpus(
	skill: string,
	instructions: string,
	roots: readonly CorpusRoot[],
): Promise<readonly HashedFile[]> {
	const files = await captureDirectories(
		await stageCorpusDirectories(skill, roots),
	);
	return [
		{ path: "CLAUDE.md", sha256: sha256(instructions) },
		...files.map(({ file }) => file),
	];
}

interface CorpusCopy {
	readonly directories: readonly CorpusDirectory[];
	readonly files: readonly CapturedCorpusFile[];
	readonly instructions: string;
	readonly destination: string;
}

async function copyCorpusFiles(copy: CorpusCopy): Promise<void> {
	for (const { layoutPath } of copy.directories) {
		await mkdir(join(copy.destination, layoutPath), { recursive: true });
	}

	await Bun.write(join(copy.destination, "CLAUDE.md"), copy.instructions);

	for (const { source, file } of copy.files) {
		const target = join(copy.destination, file.path);

		await mkdir(dirname(target), { recursive: true });
		await cp(join(source.root, file.path), target, { dereference: true });
	}
}

export async function snapshotStageCorpus(
	skill: string,
	instructions: string,
	roots: readonly CorpusRoot[],
	destination: string,
): Promise<readonly HashedFile[]> {
	const directories = await stageCorpusDirectories(skill, roots);
	const files = await captureDirectories(directories);

	await copyCorpusFiles({ directories, files, instructions, destination });

	return captureStageCorpus(skill, instructions, [
		{ kind: "directory", root: destination },
	]);
}

/**
 * `cp` dereferences, so an entry reached through a link installs bytes from
 * outside the snapshot into the worktree the session reads, while the record
 * says the session read the snapshot. Containment of the resolved path is what
 * answers it, because the link can be the entry or any directory above it.
 */
async function refuseUncontainedEntries(
	snapshotDirectory: string,
): Promise<void> {
	for (const entry of await readdir(snapshotDirectory, {
		recursive: true,
		withFileTypes: true,
	})) {
		const absolute = join(entry.parentPath, entry.name);
		if (await resolvesOutside(snapshotDirectory, absolute)) {
			throw symlinkedEntry(
				join(relative(snapshotDirectory, entry.parentPath), entry.name),
			);
		}
	}
}

export async function installStageCorpusSnapshot(
	snapshotDirectory: string,
	targetDirectory: string,
): Promise<void> {
	await refuseUncontainedEntries(snapshotDirectory);
	const source = { kind: "directory", root: snapshotDirectory } as const;
	const directories: CorpusDirectory[] = [];
	for (const kind of CORPUS_LAYOUT_DIRECTORIES) {
		const directory = await resolveLayoutDirectory(kind, [source]);
		if (directory !== undefined) {
			directories.push(directory);
		}
	}

	const files = await captureDirectories(directories);
	const instructions = await readCorpusInstructions(source);
	const destination = join(targetDirectory, ".claude");

	await mkdir(destination, { recursive: true });

	// Each stage replaces the installed layout, including kinds it no longer has.
	for (const kind of [...CORPUS_LAYOUT_DIRECTORIES, "CLAUDE.md"]) {
		await rm(join(destination, kind), { recursive: true, force: true });
	}

	await copyCorpusFiles({ directories, files, instructions, destination });
}

/**
 * The checkpoint recorded at run start, before any stage runs, so the first
 * stage replays from a checkpoint like every other stage. The name is
 * reserved in pipeline definitions; a stage of the same name would claim the
 * same checkpoint directory.
 */
export const INITIAL_CHECKPOINT_STAGE = "initial";

/**
 * The initial checkpoint consumes no corpus: no skill ran to produce it. Its
 * upstream is the root lineage, so the chain starts at the initial state the
 * run created rather than at any stage's output.
 */
export function initialCheckpointInputs(
	root: RootLineageInputs,
	model: string,
	effort?: Effort,
	settingsFile?: HashedFile,
): CheckpointInputs {
	return {
		stage: INITIAL_CHECKPOINT_STAGE,
		targetSha: root.taskSha,
		upstream: rootLineage(root),
		model,
		effort,
		corpusFiles: [],
		artifacts: [],
		settingsFile,
	};
}

/**
 * The first stage has no upstream checkpoint; its upstream is the initial
 * state the run created: the task commit, the task and brief texts that feed
 * every session, and the workflow files present before any stage ran.
 */
export function rootLineage(inputs: RootLineageInputs): string {
	return sha256(
		JSON.stringify({
			taskSha: inputs.taskSha,
			task: sha256(inputs.task),
			productBrief: sha256(inputs.productBrief),
			workflowFiles: canonicalFiles(inputs.workflowFiles),
		}),
	);
}

interface StalenessInputs {
	readonly model: string;
	readonly effort?: Effort | undefined;
}

type SettingsComparison =
	| {
			readonly settingsFile?: undefined;
			readonly settingsFileRefusal?: undefined;
	  }
	| {
			readonly settingsFile: HashedFile;
			readonly settingsFileRefusal?: never;
	  }
	| {
			readonly settingsFile?: never;
			readonly settingsFileRefusal: string;
	  };

export type StalenessRequest = StalenessInputs & SettingsComparison;

export interface CheckpointStaleness {
	readonly stage: string;
	readonly stale: boolean;
	readonly causes: readonly string[];
	/** The stage's own corpus files that changed, never its upstream's. */
	readonly changedFiles: readonly ChangedCorpusFile[];
	/**
	 * Stale only because corpus files changed: files this stage read, and
	 * files that staled its upstream, with no model, effort, settings or
	 * refusal among the causes.
	 */
	readonly onlyCorpusFiles: boolean;
}

/**
 * A stage's corpus as it stands today: the files it hashes to, or the reason
 * the tree could not be hashed at all. A refusal is a comparison the reader
 * cannot be given, and reading it as no difference would badge the checkpoint
 * fresh on a corpus nobody can reproduce, so it stales the stage the same way
 * an edited file does.
 */
export type StageCorpus =
	| { readonly hashed: readonly HashedFile[] }
	| { readonly refused: string };

export function hashedCorpus(files: readonly HashedFile[]): StageCorpus {
	return { hashed: files };
}

export function refusedCorpus(reason: string): StageCorpus {
	return { refused: reason };
}

/**
 * How a reader is told about each way two corpora can differ. Staleness and
 * the comparison guard ask the same question of the same data and differ only
 * in what the answer means to their reader, so the traversal is shared and
 * the wording is theirs.
 */
export interface CorpusDifferenceWording {
	/** Present in both, hashing differently. */
	readonly modified: (path: string) => string;
	/** Present in the left side only. */
	readonly missingFromRight: (path: string) => string;
	/** Present in the right side only. */
	readonly missingFromLeft: (path: string) => string;
}

function assertUniqueCorpusPaths(files: readonly HashedFile[]): void {
	const paths = new Set<string>();

	for (const file of files) {
		if (paths.has(file.path)) {
			throw new Error(`Duplicate corpus path: ${file.path}`);
		}

		paths.add(file.path);
	}
}

/**
 * How one corpus file the record read differs now: its bytes changed, it was
 * added to the side compared against, or it was removed from it.
 */
export interface ChangedCorpusFile {
	readonly path: string;
	readonly change: "changed" | "added" | "removed";
}

/**
 * Every file two sets of hashed files disagree on, the left side being the
 * record and the right the corpus it is compared against.
 */
function corpusFileChanges(
	left: readonly HashedFile[],
	right: readonly HashedFile[],
): ChangedCorpusFile[] {
	assertUniqueCorpusPaths(left);
	assertUniqueCorpusPaths(right);

	const rightByPath = new Map(right.map((file) => [file.path, file.sha256]));
	const changes: ChangedCorpusFile[] = [];

	for (const file of left) {
		const counterpart = rightByPath.get(file.path);
		if (counterpart === undefined) {
			changes.push({ path: file.path, change: "removed" });
			continue;
		}
		if (counterpart !== file.sha256) {
			changes.push({ path: file.path, change: "changed" });
		}

		rightByPath.delete(file.path);
	}

	for (const path of rightByPath.keys()) {
		changes.push({ path, change: "added" });
	}

	return changes.toSorted((first, second) =>
		first.path.localeCompare(second.path),
	);
}

/**
 * Every way two sets of hashed files disagree, each named by its path so a
 * reader learns which file it was, not merely that one differed. Sorted, so
 * the same disagreement reads the same way twice.
 */
export function corpusDifferences(
	left: readonly HashedFile[],
	right: readonly HashedFile[],
	wording: CorpusDifferenceWording,
): string[] {
	const words = {
		changed: wording.modified,
		removed: wording.missingFromRight,
		added: wording.missingFromLeft,
	};

	return corpusFileChanges(left, right)
		.map(({ path, change }) => words[change](path))
		.toSorted();
}

/** Each changed file as a stale cause, the path and how it changed. */
function changedFileCauses(
	changedFiles: readonly ChangedCorpusFile[],
): string[] {
	return changedFiles.map(({ path, change }) => `${path} ${change}`).toSorted();
}

/**
 * A corpus file the record has and the corpus no longer does was removed;
 * the reverse was added. Both invalidate the checkpoint as surely as an edit.
 */
export function stageCorpusChanges(
	recorded: readonly HashedFile[],
	current: StageCorpus,
): Pick<CheckpointStaleness, "causes" | "changedFiles"> {
	if ("refused" in current) {
		return { causes: [current.refused], changedFiles: [] };
	}

	const changedFiles = corpusFileChanges(recorded, current.hashed);

	return { causes: changedFileCauses(changedFiles), changedFiles };
}

/**
 * Whether a stage's own corpus causes are files it read that changed, and at
 * least one: a refusal is a cause `stageCorpusChanges` gives no file for.
 */
export function readChangedFilesOnly(
	corpus: Pick<CheckpointStaleness, "causes" | "changedFiles">,
): boolean {
	return (
		corpus.changedFiles.length > 0 &&
		corpus.causes.length === corpus.changedFiles.length
	);
}

/** The cause a record run on one model gets when another is now asked for. */
export function modelCause(recorded: string, now: string): string {
	return `model ${recorded} is now ${now}`;
}

/** The cause a record run at one effort gets when another is now asked for. */
export function effortCause(
	recorded: Effort | undefined,
	now: Effort | undefined,
): string {
	return `effort ${recorded ?? "none"} is now ${now ?? "none"}`;
}

/** The causes a checkpoint's model, effort and stage settings give it. */
function knobCauses(
	record: CheckpointRecord,
	request: StalenessRequest,
): string[] {
	const causes: string[] = [];
	if (record.model !== request.model) {
		causes.push(modelCause(record.model, request.model));
	}
	if (record.effort !== request.effort) {
		causes.push(effortCause(record.effort, request.effort));
	}
	if (request.settingsFileRefusal !== undefined) {
		causes.push(request.settingsFileRefusal);
	} else if (record.settingsFile?.sha256 !== request.settingsFile?.sha256) {
		const candidate =
			request.settingsFile?.path ?? record.settingsFile?.path ?? "none";
		const path = isAbsolute(candidate) ? basename(candidate) : candidate;
		causes.push(`stage settings file ${path} changed`);
	}

	return causes;
}

/**
 * Walks the chain in order, so an upstream stale checkpoint carries forward:
 * a checkpoint produced from state that can no longer be reproduced is stale
 * whatever its own corpus says. The initial checkpoint consumes no corpus, so
 * model, effort, or stage settings can still make it stale.
 *
 * A stage absent from `current` is one the corpus no longer feeds; its own
 * corpus is left unjudged and only its upstream can make it stale.
 */
export function deriveStaleness(
	chain: readonly CheckpointRecord[],
	current: ReadonlyMap<string, StageCorpus>,
	request: StalenessRequest,
): CheckpointStaleness[] {
	const staleness: CheckpointStaleness[] = [];
	let staleUpstream: string | undefined;
	let upstreamOnlyCorpusFiles = true;

	for (const record of chain) {
		const knobs = knobCauses(record, request);
		const currentCorpus = current.get(record.stage);
		const corpus =
			currentCorpus === undefined
				? { causes: [], changedFiles: [] }
				: stageCorpusChanges(record.corpusFiles, currentCorpus);
		const causes = [
			...(staleUpstream === undefined
				? []
				: [`upstream stage ${staleUpstream} is stale`]),
			...knobs,
			...corpus.causes,
		];

		const stale = causes.length > 0;
		const onlyCorpusFiles: boolean =
			knobs.length === 0 &&
			upstreamOnlyCorpusFiles &&
			readChangedFilesOnly(corpus);
		staleness.push({
			stage: record.stage,
			stale,
			causes,
			changedFiles: corpus.changedFiles,
			onlyCorpusFiles,
		});
		if (stale && staleUpstream === undefined) {
			staleUpstream = record.stage;
			upstreamOnlyCorpusFiles = onlyCorpusFiles;
		}
	}

	return staleness;
}

export function hashArtifacts(
	artifacts: readonly { readonly path: string; readonly content: string }[],
): readonly HashedFile[] {
	return artifacts.map(({ path, content }) => ({
		path,
		sha256: sha256(content),
	}));
}

export const hashedFileSchema = z.object({
	path: z
		.string()
		.min(1)
		.refine(
			(path) => !path.startsWith("/") && !path.split("/").includes(".."),
			"must be a relative path without traversal",
		),
	sha256: z.string().regex(/^[0-9a-f]{64}$/u),
});

/**
 * A stage's raw session transcript, or an explicit statement that the provider
 * supplied none. The status is recorded rather than inferred from a missing
 * file, because a reader that finds no transcript cannot otherwise tell a stage
 * that produced none from one whose capture was never attempted, and would be
 * free to read the stage's parsed exchanges as if they were the raw record.
 *
 * The field is optional: checkpoints written before this existed carry no
 * transcript at all, and must keep parsing.
 */
const stageTranscriptEvidenceSchema = z.discriminatedUnion("status", [
	z.object({
		status: z.literal("AVAILABLE"),
		sessionId: z.string().min(1),
		file: z.string().min(1),
	}),
	z.object({
		status: z.literal("UNAVAILABLE"),
		sessionId: z.string().min(1),
	}),
]);

export type StageTranscriptEvidence = Immutable<
	z.infer<typeof stageTranscriptEvidenceSchema>
>;

const checkpointRecordSchema = z
	.object({
		stage: z.string().min(1),
		targetSha: z.string().min(1),
		lineage: z.string().min(1),
		upstream: z.string().min(1),
		model: z.string().min(1),
		effort: effortSchema.optional(),
		corpusFiles: z.array(hashedFileSchema),
		artifacts: z.array(hashedFileSchema),
		workflowState: z.array(hashedFileSchema),
		settingsFile: hashedFileSchema.optional(),
		transcript: stageTranscriptEvidenceSchema.optional(),
		corpusVersion: corpusMeasurementSchema.optional(),
	})
	.strict();

export type CheckpointRecord = Immutable<
	z.infer<typeof checkpointRecordSchema>
>;

export function parseCheckpointRecord(text: string): CheckpointRecord {
	return checkpointRecordSchema.parse(JSON.parse(text));
}

export interface CheckpointInputs {
	readonly stage: string;
	readonly targetSha: string;
	readonly upstream: string;
	readonly model: string;
	readonly effort?: Effort | undefined;
	readonly corpusFiles: readonly HashedFile[];
	readonly artifacts: readonly HashedFile[];
	readonly settingsFile?: HashedFile | undefined;
	readonly transcript?: StageTranscriptSource | undefined;
	readonly corpusVersion?: CorpusMeasurement | undefined;
}

const RECORD_FILE = "checkpoint.json";
const SNAPSHOT_DIRECTORY = "workflow-state";

export async function hashWorkflowState(
	targetDir: string,
): Promise<readonly HashedFile[]> {
	const files: HashedFile[] = [];

	for (const entry of await existingWorkflowEntries(targetDir)) {
		if (entry.isDirectory) {
			files.push(
				...(await hashDirectory(entry.absolutePath, entry.path, {
					rootMayBeALink: false,
				})),
			);
		} else {
			files.push({
				path: entry.path,
				sha256: await hashFile(entry.absolutePath),
			});
		}
	}

	return files;
}

/**
 * The snapshot is a byte-faithful copy, never the bounded captures used for
 * judge context: materializing it must reproduce exactly the state the next
 * stage consumed (ACT-2 decision 2).
 */
const TRANSCRIPT_FILE = "transcript.jsonl";

/**
 * Copies the provider's transcript beside the checkpoint so it survives the
 * working directory it was written under. The bytes are copied rather than the
 * path recorded: the source lives in the operator's own projects directory and
 * a later read of an absolute path there has already broken once.
 */
async function preserveStageTranscript(
	targetDir: string,
	directory: string,
	source: StageTranscriptSource | undefined,
): Promise<StageTranscriptEvidence | undefined> {
	if (source === undefined) {
		return undefined;
	}

	const written = Bun.file(
		join(
			source.projectsDirectory,
			projectSlug(targetDir),
			`${source.sessionId}.jsonl`,
		),
	);
	if (!(await written.exists())) {
		return { status: "UNAVAILABLE", sessionId: source.sessionId };
	}

	await mkdir(directory, { recursive: true });
	await Bun.write(join(directory, TRANSCRIPT_FILE), written);

	return {
		status: "AVAILABLE",
		sessionId: source.sessionId,
		file: TRANSCRIPT_FILE,
	};
}

export async function recordCheckpoint(
	targetDir: string,
	directory: string,
	inputs: CheckpointInputs,
): Promise<CheckpointRecord> {
	const workflowState = await hashWorkflowState(targetDir);
	await copyWorkflowState(targetDir, join(directory, SNAPSHOT_DIRECTORY));

	const record: CheckpointRecord = {
		stage: inputs.stage,
		targetSha: inputs.targetSha,
		lineage: lineageKey(inputs),
		upstream: inputs.upstream,
		model: inputs.model,
		effort: inputs.effort,
		corpusFiles: canonicalFiles(inputs.corpusFiles),
		artifacts: canonicalFiles(inputs.artifacts),
		workflowState: canonicalFiles(workflowState),
		settingsFile: inputs.settingsFile,
		transcript: await preserveStageTranscript(
			targetDir,
			directory,
			inputs.transcript,
		),
		corpusVersion: inputs.corpusVersion,
	};
	await Bun.write(
		join(directory, RECORD_FILE),
		`${JSON.stringify(record, null, 2)}\n`,
	);

	return record;
}

export async function readCheckpointRecord(
	directory: string,
): Promise<CheckpointRecord> {
	return parseCheckpointRecord(
		await Bun.file(join(directory, RECORD_FILE)).text(),
	);
}

export async function materializeCheckpoint(
	directory: string,
	destination: string,
): Promise<CheckpointRecord> {
	const record = await readCheckpointRecord(directory);

	// The snapshot must match the record exactly — a modified, missing, or
	// planted file all void it — and nothing is copied until it does.
	const snapshot = join(directory, SNAPSHOT_DIRECTORY);
	const recorded = new Map(
		record.workflowState.map((file) => [file.path, file.sha256]),
	);
	for (const file of await hashWorkflowState(snapshot)) {
		const expected = recorded.get(file.path);
		if (expected === undefined) {
			throw new Error(
				`Checkpoint snapshot does not match its record: ${file.path} is not recorded`,
			);
		}
		if (file.sha256 !== expected) {
			throw new Error(
				`Checkpoint snapshot does not match its record: ${file.path} hashes ${file.sha256}, recorded ${expected}`,
			);
		}

		recorded.delete(file.path);
	}
	const missing = recorded.keys().next();
	if (missing.done !== true) {
		throw new Error(
			`Checkpoint snapshot does not match its record: ${missing.value} is recorded but missing`,
		);
	}

	// Whole trees, not the recorded files one by one: the workflow tools
	// expect their empty directories (backlog/docs, backlog/drafts, ...) to
	// exist, and only a tree copy carries them.
	await copyWorkflowState(snapshot, destination);

	return record;
}
