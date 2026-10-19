import type {
	ChangedCorpusFile,
	CheckpointStaleness,
	RecordedReads,
	StageCorpus,
	StalenessLink,
} from "./checkpoint";
import {
	readCorpusFiles,
	stageCorpusChanges,
	withLoadedFilesNow,
} from "./checkpoint";
import type { StageDefinition } from "./pipeline";
import type { ReadManifestEntry } from "./read-manifest";
import type {
	CurrentStageReading,
	JudgedReadEntry,
	JudgedReads,
} from "./staleness-contract";
import { rubricCauses, rubricHashNow } from "./staleness-rubrics";

/**
 * The corpus files that changed since the record, or undefined when the corpus
 * under test refused to be read and no file can be shown to still match.
 */
function comparedCorpus(
	now: StageCorpus | undefined,
	changes: Pick<CheckpointStaleness, "changedFiles">,
): readonly ChangedCorpusFile[] | undefined {
	return now !== undefined && "refused" in now
		? undefined
		: changes.changedFiles;
}

/**
 * A project entry gets no state, since the target repository is not under
 * test, and neither does an entry that recorded no hash to compare or a
 * corpus entry the corpus under test could not be compared against.
 */
async function judgedReadManifest(
	entries: readonly ReadManifestEntry[] | undefined,
	changedFiles: readonly ChangedCorpusFile[] | undefined,
	definition: StageDefinition | undefined,
): Promise<readonly JudgedReadEntry[]> {
	const judged: JudgedReadEntry[] = [];
	await Array.fromAsync(entries ?? [], async (entry) => {
		if (
			entry.sha256 === undefined ||
			entry.half === "project" ||
			(entry.half === "corpus" && changedFiles === undefined)
		) {
			judged.push(entry);
		} else if (entry.half === "corpus") {
			const changed = (changedFiles ?? []).some(
				({ path }) => path === entry.path,
			);
			judged.push({ ...entry, state: changed ? "changed" : "unchanged" });
		} else {
			const now = await rubricHashNow(definition, entry.path);
			judged.push({
				...entry,
				state: now === entry.sha256 ? "unchanged" : "changed",
			});
		}
	});

	return judged;
}

/**
 * One record's reads judged against its corpus now, with each file it loaded
 * beyond its captured ones read from `source`, so both sides hold the same
 * files and each manifest entry says whether its file changed.
 */
async function judgedReads(
	reads: RecordedReads,
	{ current, source, definition }: CurrentStageReading,
): Promise<JudgedReads> {
	const readFiles = readCorpusFiles(reads);
	const now = await withLoadedFilesNow(current, reads, source);
	const changes = stageCorpusChanges(readFiles, now);

	return {
		...changes,
		readFiles,
		readManifest: await judgedReadManifest(
			reads.readManifest,
			comparedCorpus(now, changes),
			definition,
		),
	};
}

async function chainRubricCauses(
	chain: readonly StalenessLink[],
	stages: readonly StageDefinition[],
): Promise<ReadonlyMap<string, readonly string[]>> {
	const causes = new Map<string, readonly string[]>();
	await Array.fromAsync(chain, async (record) => {
		const rubricEntries = (record.readManifest ?? []).filter(
			({ half }) => half === "rubric",
		);
		const { stage } = record;
		const definition = stages.find(({ name }) => name === record.stage);
		const currentRubricReads = await judgedReadManifest(
			rubricEntries,
			[],
			definition,
		);
		causes.set(stage, rubricCauses(currentRubricReads));
	});

	return causes;
}

export { chainRubricCauses, judgedReadManifest, comparedCorpus, judgedReads };
