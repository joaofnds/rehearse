import { basename, isAbsolute } from "node:path";

import type { HashedFile } from "./checkpoint-lineage";
import type { CheckpointRecord } from "./checkpoint-record";
import type { Effort } from "./config";
import type { ChangedCorpusFile, StageCorpus } from "./corpus-file-changes";
import { stageCorpusChanges } from "./corpus-file-changes";
import type { RecordedReads } from "./recorded-corpus-files";
import { readCorpusFiles } from "./recorded-corpus-files";

const EMPTY_COLLECTION_LENGTH = 0;

interface StalenessInputs {
	readonly model: string;
	readonly effort?: Effort | undefined;
	/** Each stage's judge rubric causes, which stale it without counting as corpus-file causes. */
	readonly judgeRubricCauses: ReadonlyMap<string, readonly string[]>;
}

type SettingsComparison =
	| {
			readonly settingsFile?: undefined;
			readonly settingsFileRefusal?: undefined;
	  }
	| {
			readonly settingsFile: HashedFile;
			readonly settingsFileRefusal?: never;
	  }
	| {
			readonly settingsFile?: never;
			readonly settingsFileRefusal: string;
	  };

type StalenessRequest = StalenessInputs & SettingsComparison;

interface CheckpointStaleness {
	readonly stage: string;
	readonly stale: boolean;
	readonly causes: readonly string[];
	/** The stage's own corpus files that changed, never its upstream's. */
	readonly changedFiles: readonly ChangedCorpusFile[];
	/**
	 * Stale only because corpus files changed: files this stage read, and
	 * files that staled its upstream, with no model, effort, settings or
	 * refusal among the causes.
	 */
	readonly onlyCorpusFiles: boolean;
}

/**
 * Whether a stage's own corpus causes are files it read that changed, and at
 * least one: a refusal is a cause `stageCorpusChanges` gives no file for.
 */
function readChangedFilesOnly(
	corpus: Pick<CheckpointStaleness, "causes" | "changedFiles">,
): boolean {
	return (
		corpus.changedFiles.length > EMPTY_COLLECTION_LENGTH &&
		corpus.causes.length === corpus.changedFiles.length
	);
}

function modelCause(recorded: string, now: string): string {
	return `model ${recorded} is now ${now}`;
}

function effortCause(
	recorded: Effort | undefined,
	now: Effort | undefined,
): string {
	return `effort ${recorded ?? "none"} is now ${now ?? "none"}`;
}

/**
 * What judging one stage's staleness reads from its record. A checkpoint
 * carries all of it, and so does a stage its judge stopped, whose stop record
 * keeps its reads though it saved no checkpoint.
 */
type StalenessLink = Pick<
	CheckpointRecord,
	"stage" | "model" | "effort" | "settingsFile"
> &
	RecordedReads;

function stageSettingsCause(
	record: StalenessLink,
	request: StalenessRequest,
): string {
	const candidate =
		request.settingsFile?.path ?? record.settingsFile?.path ?? "none";
	const path = isAbsolute(candidate) ? basename(candidate) : candidate;

	return `stage settings file ${path} changed`;
}

/** The causes a stage's model, effort and stage settings give it. */
function knobCauses(
	record: StalenessLink,
	request: StalenessRequest,
): string[] {
	const causes: string[] = [];
	if (record.model !== request.model) {
		causes.push(modelCause(record.model, request.model));
	}
	if (record.effort !== request.effort) {
		causes.push(effortCause(record.effort, request.effort));
	}
	if (request.settingsFileRefusal !== undefined) {
		causes.push(request.settingsFileRefusal);
	} else if (record.settingsFile?.sha256 !== request.settingsFile?.sha256) {
		causes.push(stageSettingsCause(record, request));
	}

	return causes;
}

/**
 * Walks the chain in order, so an upstream stale checkpoint carries forward:
 * a checkpoint produced from state that can no longer be reproduced is stale
 * whatever its own corpus says. The initial checkpoint consumes no corpus, so
 * model, effort, or stage settings can still make it stale.
 *
 * A stage absent from `current` is one the corpus no longer feeds; its own
 * corpus is left unjudged and only its upstream can make it stale.
 */
interface StageStalenessContext {
	readonly record: StalenessLink;
	readonly current: ReadonlyMap<string, StageCorpus>;
	readonly request: StalenessRequest;
	readonly upstreamStage: string | undefined;
	readonly upstreamOnlyCorpusFiles: boolean;
}

function stageStaleness({
	record,
	current,
	request,
	upstreamStage,
	upstreamOnlyCorpusFiles,
}: StageStalenessContext): CheckpointStaleness {
	const knobs = [
		...knobCauses(record, request),
		...(request.judgeRubricCauses.get(record.stage) ?? []),
	];
	const currentCorpus = current.get(record.stage);
	const corpus =
		currentCorpus === undefined
			? { causes: [], changedFiles: [] }
			: stageCorpusChanges(readCorpusFiles(record), currentCorpus);
	const causes = [
		...(upstreamStage === undefined
			? []
			: [`upstream stage ${upstreamStage} is stale`]),
		...knobs,
		...corpus.causes,
	];

	const stale = causes.length > EMPTY_COLLECTION_LENGTH;
	const onlyCorpusFiles: boolean =
		knobs.length === EMPTY_COLLECTION_LENGTH &&
		upstreamOnlyCorpusFiles &&
		readChangedFilesOnly(corpus);

	return {
		causes,
		changedFiles: corpus.changedFiles,
		onlyCorpusFiles,
		stage: record.stage,
		stale,
	};
}

function deriveStaleness(
	chain: readonly StalenessLink[],
	current: ReadonlyMap<string, StageCorpus>,
	request: StalenessRequest,
): CheckpointStaleness[] {
	const staleness: CheckpointStaleness[] = [];
	let staleUpstream: string | undefined = undefined;
	let upstreamOnlyCorpusFiles = true;

	for (const record of chain) {
		const result = stageStaleness({
			current,
			record,
			request,
			upstreamOnlyCorpusFiles,
			upstreamStage: staleUpstream,
		});

		staleness.push(result);
		if (result.stale && staleUpstream === undefined) {
			staleUpstream = record.stage;
			upstreamOnlyCorpusFiles = result.onlyCorpusFiles;
		}
	}

	return staleness;
}

export { readChangedFilesOnly, modelCause, effortCause, deriveStaleness };
export type { StalenessRequest, CheckpointStaleness, StalenessLink };
