import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve, sep } from "node:path";
import { z } from "zod";
import { CorpusConfigurationError } from "./corpus-configuration";
import { unhandled } from "./contracts";
import type { ClassifiedEntry } from "./file-presence";
import {
	classifyEntry,
	refusedEntryReason,
	statIfExists,
	SymlinkedEntryError,
} from "./file-presence";

export { CorpusConfigurationError } from "./corpus-configuration";

/**
 * Where the corpus is installed for a session that names no source. Every
 * other corpus kind is already read from here; the instruction file is too.
 */
export function liveCorpusRoot(): string {
	return join(homedir(), ".claude");
}

/** The roots a corpus source permits reads to resolve within. */
export interface DirectoryCorpusRoot {
	readonly kind: "directory";
	readonly root: string;
}

export interface LiveCorpusRoot {
	readonly kind: "live";
	readonly root: string;
	readonly backingRoot: string;
}

export type CorpusRoot = DirectoryCorpusRoot | LiveCorpusRoot;

export class CorpusFileError extends Error {
	public override name = "CorpusFileError";
}

/**
 * A declared path is data, and `..` in it would name a file the corpus install
 * does not hold, whose bytes would then be hashed into lineage and whose
 * resolved path would be printed in the attempt record. This reads the path as
 * written and resolves no link in it: where the bytes actually land is
 * `resolvesOutside`, which the reads and hashes consult before opening them.
 */
function withoutTraversal(root: string, layoutPath: string): string {
	const absolute = resolve(root, layoutPath);
	if (!absolute.startsWith(`${root}${sep}`)) {
		throw new CorpusFileError(
			`Corpus file ${layoutPath} names a path outside the corpus install`,
		);
	}

	return absolute;
}

/**
 * The corpus's global instruction file, in corpus layout. A repository's own
 * CLAUDE.md is its project instructions and is not this file.
 */
export const CORPUS_INSTRUCTIONS_PATH = "CLAUDE.md";

/**
 * The directories corpus layout holds beside the instruction file. Resolving a
 * declared path, enumerating a source, and deciding whether a directory is a
 * corpus at all are three readings of this one list, so a source cannot hold a
 * kind one of them then fails to see.
 */
export const CORPUS_LAYOUT_DIRECTORIES: readonly string[] = [
	"skills",
	"agents",
	"output-styles",
	"rulebook",
];

/**
 * The one predicate that knows what a corpus layout path looks like, so a
 * second reader (observing what a session loaded, rather than resolving it to
 * bytes) answers the same question the same way instead of drifting from it.
 */
export function isCorpusLayoutPath(path: string): boolean {
	return (
		path === CORPUS_INSTRUCTIONS_PATH ||
		CORPUS_LAYOUT_DIRECTORIES.some((directory) =>
			path.startsWith(`${directory}/`),
		)
	);
}

/**
 * The layout path a read path carries, or nothing where it carries none. Both
 * roots a corpus can live under, the live install and an attempt's overlay,
 * put the layout path after a `.claude/` segment, so the suffix after the last
 * one is the name a declared entry is already written in.
 *
 * Paired with `isCorpusLayoutPath` above so the two readers that answer "what
 * corpus file is this read?" split the path the same way rather than drifting.
 */
export function corpusLayoutSuffix(path: string): string | undefined {
	const marker = "/.claude/";
	const at = path.lastIndexOf(marker);

	return at === -1 ? undefined : path.slice(at + marker.length);
}

/**
 * The one place that knows where a corpus layout path lands. A case names a
 * file in corpus layout paths, and this maps that layout onto the root the
 * resolved source carries, so the reader never learns where the bytes came
 * from.
 */
export function resolveCorpusFile(
	source: CorpusRoot,
	layoutPath: string,
): string {
	if (isCorpusLayoutPath(layoutPath)) {
		return withoutTraversal(source.root, layoutPath);
	}

	throw new CorpusFileError(
		`Corpus file ${layoutPath} names no corpus layout path: use CLAUDE.md, output-styles/<name>.md, agents/<name>.md, rulebook/<name>.md, or skills/<name>/...`,
	);
}

/**
 * A declared path that lands inside the root can still be a link, or sit under
 * a linked directory, and opening it reads bytes the corpus does not hold while
 * filing them under a path that says it does. `withoutTraversal` is lexical and never
 * resolves a link; an `lstat` on the leaf sees a link one level down but not an
 * intermediate directory that is one. Only resolving every component answers it,
 * and both sides get resolved because macOS resolves `/tmp` to `/private/tmp`,
 * so comparing a resolved path against a raw root rejects everything under it.
 *
 * A live source may resolve within its separately declared backing tree. That
 * permission is carried by the source, rather than discovered from its links,
 * so an escaping link cannot authorize its own target.
 */
export async function resolvesOutside(
	root: string,
	absolute: string,
): Promise<boolean> {
	const resolvedRoot = await realpath(root);
	const resolvedPath = await realpath(absolute);

	return (
		resolvedPath !== resolvedRoot &&
		!resolvedPath.startsWith(`${resolvedRoot}${sep}`)
	);
}

export async function resolvesOutsideCorpus(
	source: CorpusRoot,
	absolute: string,
): Promise<boolean> {
	if (!(await resolvesOutside(source.root, absolute))) {
		return false;
	}

	if (source.kind === "directory") {
		return true;
	}

	const backing = await statIfExists(source.backingRoot);
	if (backing === undefined) {
		return true;
	}

	if (!backing.isDirectory()) {
		throw new CorpusConfigurationError(
			`Live corpus backing root ${source.backingRoot} is not a directory`,
		);
	}

	return resolvesOutside(source.backingRoot, absolute);
}

/**
 * The refusal containment makes, or `undefined` when the path is contained.
 *
 * Resolving the path touches the file itself, so a filesystem that answered the
 * `stat` pair can still refuse this: an unreadable regular file has been
 * observed refusing `realpath` after `classifyEntry` called it a file. A path
 * whose real location cannot be established is refused for that reason, since
 * the question this asks about it has no answer.
 *
 * A failure naming anything else is not this file's refusal and surfaces
 * unchanged. A live source's authorization consults the configured backing
 * tree, and a backing tree that loops or cannot be read is a configuration
 * failure the operator has to see as one.
 */
async function uncontainedRefusal(
	source: CorpusRoot,
	layoutPath: string,
	absolute: string,
): Promise<string | undefined> {
	let outside: boolean;
	try {
		outside = await resolvesOutsideCorpus(source, absolute);
	} catch (error) {
		const reason =
			error instanceof Error ? refusedEntryReason(error, absolute) : undefined;
		if (reason === undefined) {
			throw error;
		}

		return corpusFileRefusal(layoutPath, reason);
	}
	if (!outside) {
		return undefined;
	}

	return source.kind === "live"
		? `Corpus file ${layoutPath} resolves outside the live corpus extent, which would hash bytes the corpus does not hold`
		: `Corpus file ${layoutPath} resolves outside the corpus source, which would hash bytes the corpus does not hold`;
}

async function refuseUncontained(
	source: CorpusRoot,
	layoutPath: string,
	absolute: string,
): Promise<void> {
	const refusal = await uncontainedRefusal(source, layoutPath, absolute);
	if (refusal !== undefined) {
		throw new SymlinkedEntryError(refusal);
	}
}

/**
 * What a corpus file cannot yield, named for the reader of a report: the state
 * `classifyEntry` refused, or a path that is there and holds no bytes anyway.
 * A directory and an irregular entry are refused here and skipped by a
 * recursive walk, because a declared file names bytes the corpus promised
 * while a walk is only enumerating what it finds.
 */
export function corpusFileRefusal(layoutPath: string, reason: string): string {
	return `Corpus file ${layoutPath} ${reason}`;
}

function refusalForEntry(
	layoutPath: string,
	classified: ClassifiedEntry,
): string | undefined {
	switch (classified.kind) {
		case "refused": {
			return corpusFileRefusal(layoutPath, classified.reason);
		}
		case "directory": {
			return corpusFileRefusal(
				layoutPath,
				"is a directory, so it holds no bytes to hash",
			);
		}
		case "irregular": {
			return corpusFileRefusal(
				layoutPath,
				"is not a regular file, so it holds no bytes to hash",
			);
		}
		case "absent":
		case "file": {
			return undefined;
		}
		default: {
			return unhandled(classified, "corpus entry classification");
		}
	}
}

/**
 * What the corpus holds at its instruction path: nothing, bytes at a resolved
 * path, or a refusal naming what stands there instead.
 *
 * A corpus root with no CLAUDE.md is valid, so absence is its own answer and
 * not a refusal. A CLAUDE.md that is present but cannot yield bytes is a
 * refusal, because reading it as absence would report a corpus that has no
 * instruction file, under a digest that says so confidently.
 *
 * One reader, because every caller asks the same question of the same path: the
 * corpus screen renders the refusal, `stale` makes it a cause, and the runtime
 * read throws it. A second reader of its own would let the screen name a state
 * the runtime calls missing, which is what a looping CLAUDE.md used to do.
 */
export type CorpusInstructionsEntry =
	| { readonly kind: "absent" }
	| { readonly kind: "present"; readonly path: string }
	| { readonly kind: "refused"; readonly refusal: string };

export async function corpusInstructionsEntry(
	source: CorpusRoot,
): Promise<CorpusInstructionsEntry> {
	const path = resolveCorpusFile(source, CORPUS_INSTRUCTIONS_PATH);
	const classified = await classifyEntry(path);
	if (classified.kind === "absent") {
		return { kind: "absent" };
	}

	const refusal =
		refusalForEntry(CORPUS_INSTRUCTIONS_PATH, classified) ??
		(await uncontainedRefusal(source, CORPUS_INSTRUCTIONS_PATH, path));

	return refusal === undefined
		? { kind: "present", path }
		: { kind: "refused", refusal };
}

/**
 * The corpus's global instructions, read through the same resolution every
 * other corpus kind goes through. A source with no CLAUDE.md is refused here
 * in the caller's terms rather than as a raw ENOENT at the point of use, and
 * names the resolved path, which is what tells an operator that `--corpus`
 * pointed somewhere they did not mean.
 */
export async function readCorpusInstructions(
	source: CorpusRoot,
): Promise<string> {
	const entry = await corpusInstructionsEntry(source);
	if (entry.kind === "absent") {
		throw new CorpusFileError(
			`Corpus file ${CORPUS_INSTRUCTIONS_PATH} does not exist at ${resolveCorpusFile(source, CORPUS_INSTRUCTIONS_PATH)}`,
		);
	}
	if (entry.kind === "refused") {
		throw new SymlinkedEntryError(entry.refusal);
	}

	return Bun.file(entry.path).text();
}

/**
 * The live install as a corpus source. A run, replay, or calibration takes no
 * corpus source, so the corpus it measures is whatever is installed.
 */
export const LIVE_CORPUS_BACKING_ROOT_ENV =
	"BENCHMARK_LIVE_CORPUS_BACKING_ROOT";

const backingRootSchema = z
	.string()
	.min(1)
	.refine((path) => !path.includes("\0"))
	.refine(isAbsolute);

export interface LiveCorpusSourceOptions {
	readonly root?: string | undefined;
	readonly backingRoot?: string | undefined;
	readonly env?: Readonly<Record<string, string | undefined>> | undefined;
}

export function liveCorpusSource(
	options: LiveCorpusSourceOptions = {},
): LiveCorpusRoot {
	const root = options.root ?? liveCorpusRoot();
	const configured =
		options.backingRoot ??
		(options.env ?? Bun.env)[LIVE_CORPUS_BACKING_ROOT_ENV] ??
		join(homedir(), ".agents");
	const parsed = backingRootSchema.safeParse(configured);

	if (!parsed.success) {
		throw new CorpusConfigurationError(
			`${LIVE_CORPUS_BACKING_ROOT_ENV} must name a non-empty absolute path without NUL bytes`,
		);
	}

	return { kind: "live", root, backingRoot: parsed.data };
}

export function liveCorpusInstructions(): Promise<string> {
	return readCorpusInstructions(liveCorpusSource());
}

export interface ResolvedCorpusFile {
	readonly path: string;
	readonly resolvedPath: string;
	readonly sha256: string;
}

/**
 * A declared corpus file that does not resolve is refused here, before any
 * provider call: discovering a missing style after paying for a session is the
 * failure this ordering prevents.
 */
export async function hashCorpusFiles(
	source: CorpusRoot,
	layoutPaths: readonly string[],
): Promise<readonly ResolvedCorpusFile[]> {
	const hashed: ResolvedCorpusFile[] = [];
	for (const layoutPath of layoutPaths) {
		const resolvedPath = resolveCorpusFile(source, layoutPath);
		const classified = await classifyEntry(resolvedPath);
		if (classified.kind === "absent") {
			throw new CorpusFileError(
				`Corpus file ${layoutPath} does not exist at ${resolvedPath}`,
			);
		}

		const refusal = refusalForEntry(layoutPath, classified);
		if (refusal !== undefined) {
			throw new SymlinkedEntryError(refusal);
		}

		await refuseUncontained(source, layoutPath, resolvedPath);

		const file = Bun.file(resolvedPath);
		hashed.push({
			path: layoutPath,
			resolvedPath,
			sha256: new Bun.CryptoHasher("sha256")
				.update(await file.bytes())
				.digest("hex"),
		});
	}

	return hashed;
}
