import type { PipelineDefinition } from "#benchmark/pipeline";
import { newestFirst } from "#benchmark/recorded-time";
import atLatestCorpusVersion from "#server/latest-corpus-version";
import type {
	CorpusMeasurement,
	ListedPipeline,
	ListedPipelineDefinition,
	PipelineFigures,
	PlacedRan,
	Ran,
	RanRecord,
} from "#server/pipelines-contract";

function stageNames(pipeline: PipelineDefinition): readonly string[] {
	return pipeline.stages.map(({ name }) => name);
}

/**
 * Every run and group of a task, newest first by the time each recorded, a
 * run's being its name. Groups written before groups recorded a start time
 * follow in id order.
 */
function newestRecords({ runs, groups }: Ran): readonly RanRecord[] {
	return newestFirst(
		[
			...runs.map(({ name, manifest }) => ({
				corpusVersion: manifest.corpusVersion,
				countedRuns: 1,
				stages: stageNames(manifest.pipeline),
				time: name,
			})),
			...groups.map(({ startedAt, stages, reps, corpusVersion }) => ({
				corpusVersion,
				countedRuns: reps,
				stages,
				time: startedAt,
			})),
		],
		({ time }) => time,
	);
}

const DECLARED_TASK_JUDGE_COUNT = 1;
const UNDECLARED_TASK_JUDGE_COUNT = 0;

function corpusVersionDigest(
	measurement: CorpusMeasurement,
): string | undefined {
	return measurement?.kind === "version" ? measurement.digest : undefined;
}

/** The digest each record counts once per run, newest record first. */
function digestsOf(
	records: readonly RanRecord[],
): readonly (string | undefined)[] {
	return records.flatMap(({ countedRuns, corpusVersion }) =>
		Array.from({ length: countedRuns }, () =>
			corpusVersionDigest(corpusVersion),
		),
	);
}

function figuresOf(digests: readonly (string | undefined)[]): PipelineFigures {
	const { counted, corpusVersion, leftOut } = atLatestCorpusVersion(
		digests,
		(digest) => digest,
	);

	return { corpusVersion, counted: counted.length, leftOut };
}

function listedPipeline(
	{ path, stages, declared }: ListedPipelineDefinition,
	{ runs, groups, newest }: PlacedRan,
	caseTargets: ReadonlyMap<string, string>,
): ListedPipeline {
	const cases = new Set([
		...runs.map(({ manifest }) => manifest.caseId),
		...groups.map(({ caseId }) => caseId),
	]);
	if (declared !== undefined) {
		cases.add(declared.declaration.id);
	}

	const sortedCases = [...cases].toSorted((left, right) =>
		left.localeCompare(right),
	);
	const targets = new Set(
		sortedCases.flatMap((id) => caseTargets.get(id) ?? []),
	);

	return {
		cases: sortedCases,
		declaredBy:
			declared === undefined
				? null
				: {
						id: declared.declaration.id,
						target: declared.declaration.target.path,
						title: declared.declaration.title,
					},
		figures: figuresOf(digestsOf(newest)),
		path,
		runs: runs.map(({ name }) => name),
		stageJudges: stages.length,
		stages,
		targets: [...targets],
		taskJudges:
			declared === undefined
				? UNDECLARED_TASK_JUDGE_COUNT
				: DECLARED_TASK_JUDGE_COUNT,
	};
}

export { stageNames, newestRecords, listedPipeline };
