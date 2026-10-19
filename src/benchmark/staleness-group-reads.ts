import { parseConfirmationGroupRecord } from "./confirmation-record";
import type { ParsedConfirmationGroupRecord } from "./confirmation-record";
import type { Immutable } from "./contracts";
import type { CorpusRoot } from "./corpus-file";
import {
	confirmationGroupPaths,
	confirmationRepIds,
	confirmationRepStageNames,
} from "./run-layout";
import type { ConfirmationGroupPaths } from "./run-layout";
import type { JudgedReadEntry } from "./staleness-contract";
import { currentInstructions } from "./staleness-current-corpus";
import {
	FROZEN_CORPUS,
	frozenCorpusFiles,
	frozenStageCorpora,
} from "./staleness-frozen-corpus";
import { repAttemptReads, repStageManifest } from "./staleness-group-manifests";
import { judgedReads } from "./staleness-read-manifest";
import { sessionCaseCorpusNow } from "./staleness-session-corpus";

const EMPTY_COLLECTION_LENGTH = 0;

interface RepReads {
	readonly repId: string;
	/** The pipeline stage it read in, absent for a session rep, which ran none. */
	readonly stage?: string;
	readonly readManifest: readonly JudgedReadEntry[];
}

interface GroupRepReads {
	readonly reps: readonly RepReads[];
	/** Why a rep's reads are missing from `reps` or carry no state. */
	readonly reasons: readonly string[];
}

/**
 * What each rep of one group declared and loaded, each stage apart, judged
 * the way `groupStaleness` judges the reads of all its reps together. A rep
 * stage that recorded no reads is left out. The reads are listed whether or
 * not they can be judged: a rep stage whose file does not parse is named in
 * `reasons` and the other reps still stand, and a group that cannot be judged
 * at all, its session case no longer declared or its pipeline never frozen,
 * keeps its reads with no state and says why.
 */
async function groupRepReads(
	runsDirectory: string,
	groupId: string,
	source: CorpusRoot,
): Promise<GroupRepReads> {
	const paths = confirmationGroupPaths(runsDirectory, groupId);
	const record = parseConfirmationGroupRecord(
		await Bun.file(paths.groupFile).text(),
	);
	const recorded = await recordedRepReads(runsDirectory, groupId, record);
	try {
		const judged = await judgedRepReads(
			{ paths, record },
			recorded.reps,
			source,
		);

		return {
			reasons: [...recorded.reasons, ...judged.reasons],
			reps: judged.reps,
		};
	} catch (error) {
		return {
			reasons: [
				...recorded.reasons,
				`Reads not judged: ${error instanceof Error ? error.message : String(error)}`,
			],
			reps: recorded.reps,
		};
	}
}

/** What the reps of one group recorded, with no state yet. */
async function recordedRepReads(
	runsDirectory: string,
	groupId: string,
	record: Pick<ParsedConfirmationGroupRecord, "mode">,
): Promise<GroupRepReads> {
	const paths = confirmationGroupPaths(runsDirectory, groupId);
	const reps: RepReads[] = [];
	const reasons: string[] = [];
	await Array.fromAsync(
		await confirmationRepIds(runsDirectory, groupId),
		async (repId) => {
			const stages: readonly (string | undefined)[] =
				record.mode === "session"
					? [undefined]
					: await confirmationRepStageNames(runsDirectory, groupId, repId);
			await Array.fromAsync(stages, async (stage) => {
				try {
					const readManifest =
						stage === undefined
							? await repAttemptReads(paths, repId)
							: await repStageManifest(paths, [repId], stage);
					if (readManifest.length > EMPTY_COLLECTION_LENGTH) {
						reps.push(
							stage === undefined
								? { readManifest, repId }
								: { readManifest, repId, stage },
						);
					}
				} catch (error) {
					reasons.push(
						`${[repId, stage].filter((part) => part !== undefined).join(" ")} could not be read: ${error instanceof Error ? error.message : String(error)}`,
					);
				}
			});
		},
	);

	return { reasons, reps };
}

interface RepReadContext {
	readonly paths: ConfirmationGroupPaths;
	readonly record: Immutable<ParsedConfirmationGroupRecord>;
}

async function judgedRepReads(
	{ paths, record }: RepReadContext,
	recorded: readonly RepReads[],
	source: CorpusRoot,
): Promise<GroupRepReads> {
	if (record.mode === "session") {
		return await judgedSessionRepReads(record, recorded, source);
	}
	const frozen = await frozenStageCorpora(paths, record.inputs.files, {
		instructions: await currentInstructions(source),
		source,
	});
	const corpora = new Map(frozen.map((corpus) => [corpus.stage.name, corpus]));
	const reps: RepReads[] = [];
	const unfrozen = new Set<string>();
	await Array.fromAsync(recorded, async (rep) => {
		const corpus = rep.stage === undefined ? undefined : corpora.get(rep.stage);
		if (corpus === undefined) {
			unfrozen.add(rep.stage ?? "");
			reps.push(rep);
			return;
		}

		const judged = await judgedReads(
			{ corpusFiles: corpus.corpusFiles, readManifest: rep.readManifest },
			{ current: corpus.current, definition: corpus.stage, source },
		);
		reps.push({ ...rep, readManifest: judged.readManifest });
	});
	return {
		reasons: [...unfrozen].map(
			(stage) =>
				`Reads not judged for stage ${stage}: the group froze no corpus for it`,
		),
		reps,
	};
}

async function judgedSessionRepReads(
	record: Immutable<ParsedConfirmationGroupRecord>,
	recorded: readonly RepReads[],
	source: CorpusRoot,
): Promise<GroupRepReads> {
	const corpusFiles = frozenCorpusFiles(record.inputs.files, FROZEN_CORPUS);
	const current = await sessionCaseCorpusNow(record.caseId, source);
	const reps: RepReads[] = [];
	await Array.fromAsync(recorded, async (rep) => {
		const judged = await judgedReads(
			{ corpusFiles, readManifest: rep.readManifest },
			{ current, definition: undefined, source },
		);
		reps.push({ ...rep, readManifest: judged.readManifest });
	});
	return { reasons: [], reps };
}

export { groupRepReads, recordedRepReads };

export type { RepReads, GroupRepReads };
