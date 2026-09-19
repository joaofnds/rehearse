import { cp, mkdir, readdir, realpath, stat } from "node:fs/promises";
import { basename, dirname, extname, join, relative } from "node:path";
import type { DirectoryCorpusRoot, LiveCorpusRoot } from "./corpus-file";
import { isCorpusLayoutPath, resolvesOutsideCorpus } from "./corpus-file";
import type { CorpusLayoutEntry, ResolvedCorpusSource } from "./corpus-source";
import { corpusLayoutEntries } from "./corpus-source";
import type { CorpusSnapshotOrigin } from "./session-record";

export class SessionCorpusError extends Error {
	public override name = "SessionCorpusError";
}

/**
 * The one directory a session attempt's corpus bytes are read from, for
 * hashing and for installing alike. Its shape is corpus layout, so a reader
 * cannot tell whether the bytes were copied or already installed.
 * It carries the paths the case declared because a source holds files no case
 * named, and installing or selecting one of those would run the attempt
 * against a corpus it never declared.
 */
interface SessionCorpusSnapshotFields {
	readonly origin: CorpusSnapshotOrigin;
	readonly declaredPaths: readonly string[];
}

export type SessionCorpusSnapshot = SessionCorpusSnapshotFields &
	(LiveCorpusRoot | DirectoryCorpusRoot);

/**
 * A stage's corpus is the skill it invokes, so a stage cannot run against a
 * corpus source at all: there is no second skill for a source to supply. A
 * session case is where a corpus variant is measured.
 */
export function stageCorpusRefusal(corpus: string): SessionCorpusError {
	return new SessionCorpusError(
		`A stage's corpus is the skill it invokes, so --corpus ${corpus} cannot reach it`,
	);
}

function originOf(source: ResolvedCorpusSource): CorpusSnapshotOrigin {
	if (source.kind === "directory") {
		return { kind: "directory", source: source.root };
	}

	return { kind: "live" };
}

/**
 * A live install is snapshotted by naming it rather than by copying it: a copy
 * would change the resolved paths every record before `--corpus` carries, for
 * bytes nothing installs. A declared file the attempt must *overlay* is the
 * exception, because `installSessionCorpusSnapshot` installs from a directory
 * snapshot only: left as a pointer, a declared skill or instruction file would
 * be hashed into lineage and then never delivered, and the attempt would
 * measure whatever the operator's install said at read time. Those paths are
 * copied once, when the snapshot is taken; the undeclared rest of the install
 * is left untouched.
 */
export function snapshotSessionCorpus(
	source: ResolvedCorpusSource,
	destination: string,
	declaredPaths: readonly string[],
): Promise<SessionCorpusSnapshot> {
	if (
		source.kind === "live" &&
		!declaredPaths.some((layoutPath) => isCorpusLayoutPath(layoutPath))
	) {
		return Promise.resolve({
			kind: "live",
			root: source.root,
			backingRoot: source.backingRoot,
			origin: originOf(source),
			declaredPaths: [...declaredPaths],
		});
	}

	return freezeSessionCorpus(source, destination, declaredPaths);
}

/**
 * A confirmation group cannot keep a live corpus pointer: every repetition
 * must read the bytes captured before the first provider call. This always
 * copies the declared corpus files and retains the original source only as
 * provenance, so the snapshot a reader gets back is byte-addressed by the
 * harness rather than by whatever the source still holds.
 */
export async function freezeSessionCorpus(
	source: ResolvedCorpusSource,
	destination: string,
	declaredPaths: readonly string[],
): Promise<SessionCorpusSnapshot> {
	await copyDeclared(source, destination, declaredPaths);

	return {
		kind: "directory",
		root: destination,
		origin: originOf(source),
		declaredPaths: [...declaredPaths],
	};
}

/**
 * A recursive copy dereferences, so an entry reached through a link copies bytes
 * from outside the source: the harness would hash and install whatever the link
 * points at while the record says it snapshotted a source. Containment of every
 * resolved path is what answers it, because the link can be the entry itself,
 * any directory above it, or an entry nested beneath a linked directory.
 */
async function refuseSymlinks(
	source: ResolvedCorpusSource,
	entry: CorpusLayoutEntry,
): Promise<void> {
	if (await resolvesOutsideCorpus(source, entry.sourcePath)) {
		throw symlinkedCorpusEntry(source, entry.layoutPath);
	}

	const stats = await stat(entry.sourcePath);
	if (!stats.isDirectory()) {
		return;
	}

	await refuseNestedSymlinks(source, entry, new Set());
}

async function refuseNestedSymlinks(
	source: ResolvedCorpusSource,
	directory: CorpusLayoutEntry,
	visitedDirectories: Set<string>,
): Promise<void> {
	const resolvedDirectory = await realpath(directory.sourcePath);
	if (visitedDirectories.has(resolvedDirectory)) {
		return;
	}

	visitedDirectories.add(resolvedDirectory);

	for (const name of await readdir(directory.sourcePath)) {
		const child = {
			sourcePath: join(directory.sourcePath, name),
			layoutPath: join(directory.layoutPath, name),
		};
		if (await resolvesOutsideCorpus(source, child.sourcePath)) {
			throw symlinkedCorpusEntry(source, child.layoutPath);
		}

		const sourceStats = await stat(child.sourcePath);

		if (sourceStats.isDirectory()) {
			await refuseNestedSymlinks(source, child, visitedDirectories);
			continue;
		}

		await refuseOutsideLayout(source, child);
	}
}

/**
 * A live corpus root is the operator's whole install, so containment within it
 * is not enough for a nested entry: `~/.claude` also holds credentials, saved
 * transcripts and settings, and a live copy dereferences. An entry reached
 * through a link must land in corpus layout, which is the only part of that
 * install a case declares. A directory source resolves against its own root and
 * a snapshot copies its links unresolved, so this only binds the live branch.
 */
async function refuseOutsideLayout(
	source: ResolvedCorpusSource,
	entry: CorpusLayoutEntry,
): Promise<void> {
	if (source.kind !== "live") {
		return;
	}

	const resolved = await realpath(entry.sourcePath);
	for (const root of [source.root, source.backingRoot]) {
		const resolvedRoot = await realpath(root).catch(() => undefined);
		if (resolvedRoot === undefined) {
			continue;
		}

		const layoutPath = relative(resolvedRoot, resolved);
		if (!layoutPath.startsWith("..") && isCorpusLayoutPath(layoutPath)) {
			return;
		}
	}

	throw symlinkedCorpusEntry(source, entry.layoutPath);
}

/**
 * The live wording matches `corpus-file.ts`'s, because an operator who reaches
 * this refusal through a live install needs to be told the extent includes the
 * backing tree: "outside the corpus source" reads as a source they never named.
 */
function symlinkedCorpusEntry(
	source: ResolvedCorpusSource,
	layoutPath: string,
): SessionCorpusError {
	const extent =
		source.kind === "live" ? "the live corpus extent" : "the corpus source";

	return new SessionCorpusError(
		`Corpus entry ${layoutPath} resolves outside ${extent}, which would snapshot bytes the corpus does not hold`,
	);
}

async function copyDeclared(
	source: ResolvedCorpusSource,
	destination: string,
	declaredPaths: readonly string[],
): Promise<void> {
	const entries = await corpusLayoutEntries(source);
	await mkdir(destination, { recursive: true });

	for (const entry of entries.filter((candidate) =>
		declares(declaredPaths, candidate.layoutPath),
	)) {
		await refuseSymlinks(source, entry);

		const target = join(destination, entry.layoutPath);
		await mkdir(dirname(target), { recursive: true });
		await cp(entry.sourcePath, target, {
			recursive: true,
			dereference: source.kind === "live",
		});
	}
}

/**
 * A skill is declared as `skills/<name>/<file>` but snapshotted as the whole
 * `skills/<name>` directory, so a declared path matches the entry that carries
 * it as well as the entry it names exactly.
 */
function declares(
	declaredPaths: readonly string[],
	layoutPath: string,
): boolean {
	return declaredPaths.some(
		(declared) =>
			declared === layoutPath || declared.startsWith(`${layoutPath}/`),
	);
}

/**
 * Output styles and agent definitions placed under the attempt directory's
 * `.claude` shadow the same-named user-level ones, verified on claude 2.1.258.
 * The attempt directory is the harness's own and no live session reads it, so
 * this is how a corpus variant reaches a session without an install.
 */
export async function installSessionCorpusSnapshot(
	snapshot: SessionCorpusSnapshot,
	attemptDirectory: string,
): Promise<void> {
	if (snapshot.kind === "live") {
		return;
	}

	for (const layoutPath of overlaidRoots(snapshot.declaredPaths)) {
		const target = join(attemptDirectory, ".claude", layoutPath);
		await mkdir(dirname(target), { recursive: true });
		await cp(join(snapshot.root, layoutPath), target, { recursive: true });
	}
}

const SKILLS_KIND = "skills/";

/**
 * What the attempt installs for each declared path. A skill is a directory whose
 * `SKILL.md` refers to the files beside it, so installing the declared file
 * alone delivers a skill whose references do not resolve, and under
 * `--setting-sources project` the user-level copy cannot supply them either.
 * `copyDeclared` already snapshots the whole directory, so the bytes are there.
 * Every other kind is a single file and is installed as itself.
 *
 * Every path a case may declare is overlaid, because `isCorpusLayoutPath` is
 * also what `resolveCorpusFile` requires: a declared path outside corpus layout
 * is refused before a snapshot exists. A declared skill only reaches the session
 * because `sessionCaseArgs` passes `--setting-sources project`; without that
 * flag a same-named user-level skill wins and the overlaid bytes are hashed into
 * lineage but never read. Measured on claude 2.1.278 with both copies installed.
 */
function overlaidRoots(declaredPaths: readonly string[]): readonly string[] {
	const roots = declaredPaths
		.filter((layoutPath) => isCorpusLayoutPath(layoutPath))
		.map((layoutPath) => overlaidRoot(layoutPath));

	return [...new Set(roots)];
}

function overlaidRoot(layoutPath: string): string {
	if (!layoutPath.startsWith(SKILLS_KIND)) {
		return layoutPath;
	}

	const [name] = layoutPath.slice(SKILLS_KIND.length).split("/");

	return name === undefined ? layoutPath : `${SKILLS_KIND}${name}`;
}

/**
 * Which output style the snapshot delivers, so the attempt can select it. It is
 * the one the case declared: a corpus holds styles no case named, and reading
 * the snapshot directory instead would select one of those while recording the
 * declared style's digest in lineage.
 */
export function snapshotStyleName(
	snapshot: SessionCorpusSnapshot,
): string | undefined {
	const style = snapshot.declaredPaths.find(
		(layoutPath) =>
			layoutPath.startsWith("output-styles/") && extname(layoutPath) === ".md",
	);

	return style === undefined ? undefined : basename(style, ".md");
}
