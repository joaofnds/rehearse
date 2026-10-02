/**
 * The runs one corpus version produced (doc-193 decision 4): those at the
 * latest version any run recorded, in the order given, and how many ran under
 * another version or recorded none. When no run recorded a version, every run
 * is counted and the version is null.
 */
export interface AtLatestCorpusVersion<Run> {
	readonly counted: readonly Run[];
	readonly corpusVersion: string | null;
	readonly leftOut: number;
}

/** `runs` is newest first, so the first digest found is the latest. */
export function atLatestCorpusVersion<Run>(
	runs: readonly Run[],
	digestOf: (run: Run) => string | undefined,
): AtLatestCorpusVersion<Run> {
	const latest = runs
		.map((run) => digestOf(run))
		.find((digest) => digest !== undefined);
	if (latest === undefined) {
		return { counted: runs, corpusVersion: null, leftOut: 0 };
	}

	const counted = runs.filter((run) => digestOf(run) === latest);

	return {
		counted,
		corpusVersion: latest,
		leftOut: runs.length - counted.length,
	};
}
