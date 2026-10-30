import { cp, exists, mkdir, readdir, stat } from "node:fs/promises";
import { basename, dirname, extname, join, relative } from "node:path";

import { isCorpusLayoutPath } from "./corpus-file";
import { corpusLayoutEntries } from "./corpus-source";
import type { ResolvedCorpusSource } from "./corpus-source";
import type { SessionCorpusSnapshot } from "./session-corpus";
import { SessionCorpusError } from "./session-corpus-links";

/** Whether `layoutPath` is `root` itself or a path inside it. */
function holds(root: string, layoutPath: string): boolean {
	return layoutPath === root || layoutPath.startsWith(`${root}/`);
}

/**
 * Output styles and agent definitions placed under the attempt directory's
 * `.claude` shadow the same-named user-level ones, verified on claude 2.1.258.
 * The attempt directory is the harness's own and no live session reads it, so
 * this is how a corpus variant reaches a session without an install. It
 * returns the layout paths it installed.
 */
async function installSessionCorpusSnapshot(
	snapshot: SessionCorpusSnapshot,
	attemptDirectory: string,
): Promise<readonly string[]> {
	if (snapshot.kind === "live") {
		return [];
	}

	const installed: string[] = [];
	await Array.fromAsync(await installedRoots(snapshot), async (layoutPath) => {
		const source = join(snapshot.root, layoutPath);
		const target = join(attemptDirectory, ".claude", layoutPath);
		await refuseOverwrite(target, layoutPath);
		await mkdir(dirname(target), { recursive: true });
		await cp(source, target, { recursive: true });
		installed.push(...(await filesUnder(source, layoutPath)));
	});

	return installed;
}

/**
 * A fixture or target can carry its own `.claude` files. Copying the corpus over
 * one would leave the session reading bytes neither side wrote while the record
 * hashed the fixture's.
 */
async function refuseOverwrite(
	target: string,
	layoutPath: string,
): Promise<void> {
	if (await exists(target)) {
		throw new SessionCorpusError(
			`Corpus file ${layoutPath} would overwrite the attempt's own .claude/${layoutPath}, which its fixture or target already holds`,
		);
	}
}

async function installedRoots(
	snapshot: SessionCorpusSnapshot,
): Promise<readonly string[]> {
	if (snapshot.scope === "declared") {
		return overlaidRoots(snapshot.declaredPaths);
	}

	return await wholeCorpusRoots(snapshot);
}

/** Every root a corpus holds, which is what a whole-corpus snapshot carries. */
async function wholeCorpusRoots(
	source: ResolvedCorpusSource,
): Promise<readonly string[]> {
	const entries = await corpusLayoutEntries(source);

	return entries.map(({ layoutPath }) => layoutPath);
}

/** The layout paths of the files `source` holds, itself when it is a file. */
async function filesUnder(
	source: string,
	layoutPath: string,
): Promise<readonly string[]> {
	const found = await stat(source);
	if (!found.isDirectory()) {
		return [layoutPath];
	}

	const entries = await readdir(source, {
		recursive: true,
		withFileTypes: true,
	});

	return entries
		.filter((entry) => entry.isFile())
		.map((entry) =>
			join(layoutPath, relative(source, join(entry.parentPath, entry.name))),
		);
}

const SKILLS_KIND = "skills/";

/**
 * What the attempt installs for each declared path. A skill is a directory whose
 * `SKILL.md` refers to the files beside it, so installing the declared file
 * alone delivers a skill whose references do not resolve, and under
 * `--setting-sources project` the user-level copy cannot supply them either.
 * Every other kind is a single file and is installed as itself. For an
 * isolated case, snapshotting copies these same roots and the loader accepts
 * files under them, so what a group freezes, what its attempts install, and
 * what a comparison verifies are one set. A case run with the actual setup
 * carries `wholeCorpusRoots` instead.
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

/** Whether a snapshot of the declaration carries this file. */
function deliversCorpusFile(
	declaredPaths: readonly string[],
	layoutPath: string,
): boolean {
	return overlaidRoots(declaredPaths).some((root) => holds(root, layoutPath));
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
function snapshotStyleName(
	snapshot: SessionCorpusSnapshot,
): string | undefined {
	const style = snapshot.declaredPaths.find(
		(layoutPath) =>
			layoutPath.startsWith("output-styles/") && extname(layoutPath) === ".md",
	);

	return style === undefined ? undefined : basename(style, ".md");
}

export {
	holds,
	installSessionCorpusSnapshot,
	overlaidRoots,
	wholeCorpusRoots,
	deliversCorpusFile,
	snapshotStyleName,
};
