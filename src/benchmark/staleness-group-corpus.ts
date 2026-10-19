import type { HashedFile, StageCorpus } from "./checkpoint";
import type { CorpusRoot } from "./corpus-file";
import { confirmationGroupPaths, confirmationRepIds } from "./run-layout";
import type {
	CorpusChanges,
	JudgedReadEntry,
	JudgedReads,
} from "./staleness-contract";
import {
	FROZEN_CORPUS,
	frozenCorpusFiles,
	frozenStageCorpora,
} from "./staleness-frozen-corpus";
import type {
	CurrentCorpusInputs,
	FrozenGroupFile,
} from "./staleness-frozen-corpus";
import {
	repAttemptManifest,
	repStageManifest,
} from "./staleness-group-manifests";
import { judgedReads } from "./staleness-read-manifest";

/**
 * A group freezes one corpus per stage, and a file every stage reads, the
 * instructions for one, sits in each of them. The reader is owed one line per
 * file, so a file that changed under several stages is named once.
 */
function mergedChanges(changes: readonly CorpusChanges[]): CorpusChanges {
	const causes = new Set(changes.flatMap((change) => change.causes));
	const changedFiles = new Map(
		changes.flatMap((change) =>
			change.changedFiles.map((file) => [file.path, file] as const),
		),
	);

	return {
		causes: [...causes].toSorted(),
		changedFiles: [...changedFiles.values()].toSorted((first, second) =>
			first.path.localeCompare(second.path),
		),
	};
}

interface GroupLocation {
	readonly runsDirectory: string;
	readonly groupId: string;
}

/**
 * A stage or pipeline group is judged per stage it froze, against the skill
 * its frozen pipeline names for that stage, so a later edit to the case's
 * pipeline does not change what the group is compared with.
 */
async function stageGroupChanges(
	{ runsDirectory, groupId }: GroupLocation,
	files: readonly FrozenGroupFile[],
	{ instructions, source }: CurrentCorpusInputs,
): Promise<JudgedReads> {
	const paths = confirmationGroupPaths(runsDirectory, groupId);
	const repIds = await confirmationRepIds(runsDirectory, groupId);
	const changes: CorpusChanges[] = [];
	const readFiles: HashedFile[] = [];
	const readManifest: JudgedReadEntry[] = [];
	const stages = await frozenStageCorpora(paths, files, {
		instructions,
		source,
	});

	await Array.fromAsync(stages, async ({ stage, corpusFiles, current }) => {
		const judged = await judgedReads(
			{
				corpusFiles,
				readManifest: await repStageManifest(paths, repIds, stage.name),
			},
			{ current, definition: stage, source },
		);
		readFiles.push(...judged.readFiles);
		changes.push(judged);
		readManifest.push(...judged.readManifest);
	});

	return { ...mergedChanges(changes), readFiles, readManifest };
}

interface SessionGroupCorpora {
	readonly current: () => Promise<StageCorpus>;
	readonly files: readonly FrozenGroupFile[];
}

async function sessionGroupChanges(
	{ runsDirectory, groupId }: GroupLocation,
	{ current, files }: SessionGroupCorpora,
	source: CorpusRoot,
): Promise<JudgedReads> {
	return await judgedReads(
		{
			corpusFiles: frozenCorpusFiles(files, FROZEN_CORPUS),
			readManifest: await repAttemptManifest(runsDirectory, groupId),
		},
		{ current: await current(), definition: undefined, source },
	);
}

export { sessionGroupChanges, stageGroupChanges };
