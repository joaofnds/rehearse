import { join, sep } from "node:path";

import type { HashedFile } from "./checkpoint-lineage";
import { resolvesOutsideCorpus } from "./corpus-file";
import type { DirectoryWalkOptions } from "./directory-entry-probe";
import {
	listedEntries,
	refuseIfLink,
	refusedEntry,
	symlinkedEntry,
	walkedEntry,
} from "./directory-entry-probe";
import { SymlinkedEntryError } from "./file-presence";

interface WalkedDirectory {
	readonly files: readonly HashedFile[];
	readonly refusals: readonly SymlinkedEntryError[];
}

/**
 * `walkDirectory` for a caller that refuses the whole tree on any refusal, so
 * the first one is the only one that changes its outcome.
 */
async function hashDirectory(
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

interface DirectoryTraversal {
	readonly root: string;
	readonly prefix: string;
	readonly options: DirectoryWalkOptions;
}

async function requireWalkRoot({
	root,
	prefix,
	options,
}: DirectoryTraversal): Promise<void> {
	if ("source" in options) {
		if (await resolvesOutsideCorpus(options.source, root)) {
			throw symlinkedEntry(prefix);
		}
	} else if (!options.rootMayBeALink) {
		await refuseIfLink(root, prefix);
	}
}

class DirectoryWalk {
	private readonly root: string;
	private readonly prefix: string;
	private readonly options: DirectoryWalkOptions;
	private readonly files: HashedFile[] = [];
	private readonly refusals: SymlinkedEntryError[] = [];
	private readonly refusedDirectories: string[] = [];

	public constructor({ root, prefix, options }: DirectoryTraversal) {
		this.root = root;
		this.prefix = prefix;
		this.options = options;
	}

	public readonly accept = async (entry: string): Promise<void> => {
		if (
			this.refusedDirectories.some((above) =>
				entry.startsWith(`${above}${sep}`),
			)
		) {
			return;
		}

		const walked = await walkedEntry(
			this.root,
			join(this.root, entry),
			this.options,
		);
		if ("skipped" in walked) {
			return;
		}

		if ("refused" in walked) {
			this.refusals.push(
				refusedEntry(join(this.prefix, entry), walked.refused),
			);
			this.refusedDirectories.push(entry);

			return;
		}

		this.files.push({ path: join(this.prefix, entry), sha256: walked.sha256 });
	};

	public raiseFirstRefusal(): void {
		const [first] = this.refusals;
		if (first !== undefined) {
			throw first;
		}
	}

	public result(): WalkedDirectory {
		return { files: this.files, refusals: this.refusals };
	}
}

async function walkDirectory(
	root: string,
	prefix: string,
	options: DirectoryWalkOptions,
): Promise<WalkedDirectory> {
	await requireWalkRoot({ options, prefix, root });

	const listed = await listedEntries(root, prefix);
	if ("reason" in listed) {
		return { files: [], refusals: [new SymlinkedEntryError(listed.reason)] };
	}

	const walk = new DirectoryWalk({ options, prefix, root });
	try {
		await Array.fromAsync(listed.value.toSorted(), walk.accept);
	} catch (error) {
		walk.raiseFirstRefusal();
		throw error;
	}

	return walk.result();
}

export { hashDirectory, walkDirectory };
export type { WalkedDirectory };
