import {
	refusalForEntry,
	refuseUncontained,
	uncontainedRefusal,
} from "./corpus-containment";
import {
	CORPUS_INSTRUCTIONS_PATH,
	CorpusFileError,
	resolveCorpusFile,
} from "./corpus-path";
import type { CorpusRoot } from "./corpus-path";
import { currentCorpusReadScope } from "./corpus-read-scope";
import { SymlinkedEntryError, classifyEntry } from "./file-presence";
import { liveCorpusSource } from "./live-corpus-source";

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
type CorpusInstructionsEntry =
	| { readonly kind: "absent" }
	| { readonly kind: "present"; readonly path: string }
	| { readonly kind: "refused"; readonly refusal: string };

async function corpusInstructionsEntry(
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
async function readCorpusInstructions(source: CorpusRoot): Promise<string> {
	const entry = await corpusInstructionsEntry(source);
	if (entry.kind === "absent") {
		throw new CorpusFileError(
			`Corpus file ${CORPUS_INSTRUCTIONS_PATH} does not exist at ${resolveCorpusFile(source, CORPUS_INSTRUCTIONS_PATH)}`,
		);
	}

	if (entry.kind === "refused") {
		throw new SymlinkedEntryError(entry.refusal);
	}

	return await Bun.file(entry.path).text();
}

async function liveCorpusInstructions(): Promise<string> {
	return await readCorpusInstructions(liveCorpusSource());
}

interface ResolvedCorpusFile {
	readonly path: string;
	readonly resolvedPath: string;
	readonly sha256: string;
}

/**
 * A declared corpus file that does not resolve is refused here, before any
 * provider call: discovering a missing style after paying for a session is the
 * failure this ordering prevents.
 */
async function hashCorpusFiles(
	source: CorpusRoot,
	layoutPaths: readonly string[],
): Promise<readonly ResolvedCorpusFile[]> {
	const cache = currentCorpusReadScope()?.files;
	const hashed: ResolvedCorpusFile[] = [];

	await Array.fromAsync(layoutPaths, async (layoutPath) => {
		const key = JSON.stringify([source, layoutPath]);
		let pending = cache?.get(key);
		if (pending === undefined) {
			pending = hashCorpusFile(source, layoutPath);
			cache?.set(key, pending);
		}
		hashed.push(await pending);
	});

	return hashed;
}

async function hashCorpusFile(
	source: CorpusRoot,
	layoutPath: string,
): Promise<ResolvedCorpusFile> {
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

	return {
		path: layoutPath,
		resolvedPath,
		sha256: new Bun.CryptoHasher("sha256")
			.update(await file.bytes())
			.digest("hex"),
	};
}

export {
	corpusInstructionsEntry,
	readCorpusInstructions,
	liveCorpusInstructions,
	hashCorpusFiles,
};
export type { CorpusInstructionsEntry, ResolvedCorpusFile };
export {
	liveCorpusRoot,
	LIVE_CORPUS_BACKING_ROOT_ENV,
	liveCorpusSource,
} from "./live-corpus-source";
export {
	CorpusFileError,
	CORPUS_INSTRUCTIONS_PATH,
	CORPUS_LAYOUT_DIRECTORIES,
	isCorpusLayoutPath,
	corpusLayoutSuffix,
	withoutAbsolutePaths,
	resolveCorpusFile,
} from "./corpus-path";
export {
	resolvesOutside,
	resolvesOutsideCorpus,
	corpusFileRefusal,
} from "./corpus-containment";
export type {
	DirectoryCorpusRoot,
	LiveCorpusRoot,
	CorpusRoot,
} from "./corpus-path";
export type { LiveCorpusSourceOptions } from "./live-corpus-source";

export { default as CorpusConfigurationError } from "./corpus-configuration";
