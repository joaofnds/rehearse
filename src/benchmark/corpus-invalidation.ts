import { join } from "node:path";

import type { HashedFile } from "./checkpoint";
import type { CorpusRoot } from "./corpus-file";
import hashCorpusLayout from "./corpus-layout";
import type { RowReading } from "./corpus-row-readings";
import {
	freshAgainst,
	rowReadings,
	rowsJudgedAgainst,
} from "./corpus-row-readings";
import {
	CorpusVersionError,
	readCorpusUnderTest,
	readCorpusVersion,
} from "./corpus-version";
import { corpusVersionLabel } from "./corpus-version-label";
/**
 * The run-history rows the last edit invalidated: those fresh against the
 * log entry before the corpus under test and stale against it now.
 */
type LastEdit =
	| {
			readonly kind: "measured";
			/** The version the last edit started from. */
			readonly previous: string;
			/** The version the last edit went to, the corpus under test. */
			readonly current: string;
			readonly count: number;
			readonly rows: readonly string[];
	  }
	| { readonly kind: "not-recorded"; readonly reason: string };

/** Counts of distinct run-history rows, by corpus layout path. */
interface CorpusInvalidation {
	readonly readBy: ReadonlyMap<string, number>;
	readonly invalidated: ReadonlyMap<string, number>;
	readonly lastEdit: LastEdit;
}

interface CorpusEditImpact {
	readonly layoutPaths: readonly string[];
	readonly edit: {
		readonly path: string;
		readonly bytes: Readonly<Uint8Array>;
	};
}

/**
 * The rows an edit of one file would invalidate, judged as the last edit is
 * once it is applied: fresh against the corpus under test, and stale against
 * the same files with the edited one holding its new bytes.
 */
async function rowsAnEditInvalidates(
	runsDirectory: string,
	source: CorpusRoot,
	{ layoutPaths, edit }: CorpusEditImpact,
): Promise<readonly string[]> {
	const before = await rowReadings(runsDirectory, source);
	const after = await rowsJudgedAgainst(
		runsDirectory,
		layoutPaths.map((path) => ({
			bytes: async () =>
				await (path === edit.path
					? Promise.resolve(edit.bytes)
					: Bun.file(join(source.root, path)).bytes()),
			path,
		})),
	);
	const staleAfter = new Set(
		after.filter(({ stale }) => stale === true).map(({ id }) => id),
	);

	return before
		.filter(({ id, stale }) => stale === false && staleAfter.has(id))
		.map(({ id }) => id)
		.toSorted();
}

/**
 * The previous version's hashes and the rows fresh against it, undefined
 * when the store no longer holds its manifest or one of its files.
 */
interface HistoricalCorpusJudgment {
	readonly previous: ReadonlyMap<string, string>;
	readonly freshBefore: ReadonlySet<string>;
}

interface MeasuredInvalidationRequest {
	readonly currentVersion: string;
	readonly previousVersion: string;
	readonly judgment: HistoricalCorpusJudgment;
}

async function judgedAgainst(
	runsDirectory: string,
	version: string,
): Promise<HistoricalCorpusJudgment | undefined> {
	try {
		const previous = hashesByPath(
			await readCorpusVersion(runsDirectory, version),
		);
		const freshBefore = await freshAgainst(runsDirectory, version);

		return {
			freshBefore,
			previous,
		};
	} catch (error) {
		if (
			error instanceof CorpusVersionError ||
			(error instanceof Error && "code" in error && error.code === "ENOENT")
		) {
			return undefined;
		}

		throw error;
	}
}

function hashesByPath(
	files: readonly HashedFile[],
): ReadonlyMap<string, string> {
	return new Map(files.map(({ path, sha256 }) => [path, sha256]));
}

/**
 * Judged against the corpus under test, as `stale` is. Unreadable records
 * are left out, since no judgment of them exists to count.
 */
class CorpusRowsInvalidation {
	readonly #rows: readonly RowReading[];
	readonly #current: ReadonlyMap<string, string>;
	readonly #paths: ReadonlySet<string>;
	readonly #readBy: ReadonlyMap<string, number>;
	public constructor(
		rows: readonly RowReading[],
		current: ReadonlyMap<string, string>,
	) {
		this.#rows = rows;
		this.#current = current;
		this.#paths = new Set(
			rows.flatMap(({ readFiles }) => readFiles.map(({ path }) => path)),
		);
		this.#readBy = new Map(
			[...this.#paths].map((path) => [
				path,
				rows.filter((row) => row.readFiles.some((file) => file.path === path))
					.length,
			]),
		);
	}
	public async measure(
		runsDirectory: string,
		underTest: Awaited<ReturnType<typeof readCorpusUnderTest>>,
	): Promise<CorpusInvalidation> {
		if (underTest.version === undefined) {
			return this.notRecorded(
				"the corpus under test refused hashing, so it has no place in its log",
			);
		}

		if (underTest.previousVersion === undefined) {
			return this.notRecorded(
				"the corpus under test has no earlier version in its log to compare against",
			);
		}

		const judgedBefore = await judgedAgainst(
			runsDirectory,
			underTest.previousVersion,
		);
		if (judgedBefore === undefined) {
			return this.notRecorded(
				`the previous version ${corpusVersionLabel(underTest.previousVersion)} cannot be read from the store`,
			);
		}

		return this.measured({
			currentVersion: underTest.version,
			judgment: judgedBefore,
			previousVersion: underTest.previousVersion,
		});
	}
	private notRecorded(reason: string): CorpusInvalidation {
		return {
			invalidated: new Map(),
			lastEdit: { kind: "not-recorded", reason },
			readBy: this.#readBy,
		};
	}
	private measured({
		currentVersion,
		previousVersion,
		judgment,
	}: MeasuredInvalidationRequest): CorpusInvalidation {
		const { previous, freshBefore } = judgment;
		const invalidatedRows = this.#rows
			.filter(({ id, stale }) => stale === true && freshBefore.has(id))
			.map(({ id }) => id)
			.toSorted();
		const invalidated = new Map(
			[...this.#paths].map((path) => [
				path,
				this.#rows.filter((row) =>
					row.readFiles.some(
						(file) =>
							file.path === path &&
							file.sha256 === previous.get(path) &&
							file.sha256 !== this.#current.get(path),
					),
				).length,
			]),
		);

		return {
			invalidated,
			lastEdit: {
				count: invalidatedRows.length,
				current: currentVersion,
				kind: "measured",
				previous: previousVersion,
				rows: invalidatedRows,
			},
			readBy: this.#readBy,
		};
	}
}
async function corpusInvalidation(
	runsDirectory: string,
	source: CorpusRoot,
): Promise<CorpusInvalidation> {
	const underTest = await readCorpusUnderTest(runsDirectory, source);
	const layout = await hashCorpusLayout(source);
	const current = hashesByPath(layout.files);
	const rows = await rowReadings(runsDirectory, source);

	const invalidation = new CorpusRowsInvalidation(rows, current);

	return await invalidation.measure(runsDirectory, underTest);
}
export { rowsAnEditInvalidates, corpusInvalidation };
export type { LastEdit, CorpusInvalidation };
