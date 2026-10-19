import type { HashedFile } from "./checkpoint-lineage";
import type { CheckpointStaleness } from "./checkpoint-staleness";

/**
 * A stage's corpus as it stands today: the files it hashes to, or the reason
 * the tree could not be hashed at all. A refusal is a comparison the reader
 * cannot be given, and reading it as no difference would badge the checkpoint
 * fresh on a corpus nobody can reproduce, so it stales the stage the same way
 * an edited file does.
 */
type StageCorpus =
	| { readonly hashed: readonly HashedFile[] }
	| { readonly refused: string };

function hashedCorpus(files: readonly HashedFile[]): StageCorpus {
	return { hashed: files };
}

function refusedCorpus(reason: string): StageCorpus {
	return { refused: reason };
}

/**
 * How a reader is told about each way two corpora can differ. Staleness and
 * the comparison guard ask the same question of the same data and differ only
 * in what the answer means to their reader, so the traversal is shared and
 * the wording is theirs.
 */
interface CorpusDifferenceWording {
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
interface ChangedCorpusFile {
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
	const changes = left.flatMap((file): ChangedCorpusFile[] => {
		const counterpart = rightByPath.get(file.path);
		if (counterpart === undefined) {
			return [{ change: "removed", path: file.path }];
		}

		const fileChanges: ChangedCorpusFile[] =
			counterpart === file.sha256
				? []
				: [{ change: "changed", path: file.path }];

		rightByPath.delete(file.path);

		return fileChanges;
	});

	for (const path of rightByPath.keys()) {
		changes.push({ change: "added", path });
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
function corpusDifferences(
	left: readonly HashedFile[],
	right: readonly HashedFile[],
	wording: CorpusDifferenceWording,
): string[] {
	const words = {
		added: wording.missingFromLeft,
		changed: wording.modified,
		removed: wording.missingFromRight,
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
function stageCorpusChanges(
	recorded: readonly HashedFile[],
	current: StageCorpus,
): Pick<CheckpointStaleness, "causes" | "changedFiles"> {
	if ("refused" in current) {
		return { causes: [current.refused], changedFiles: [] };
	}

	const changedFiles = corpusFileChanges(recorded, current.hashed);

	return { causes: changedFileCauses(changedFiles), changedFiles };
}
export { hashedCorpus, refusedCorpus, corpusDifferences, stageCorpusChanges };
export type { StageCorpus, CorpusDifferenceWording, ChangedCorpusFile };
