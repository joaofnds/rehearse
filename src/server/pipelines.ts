import { CaseDeclarationError } from "#benchmark/case";
import { PipelineDefinitionError } from "#benchmark/pipeline";
import {
	declaredPipelines,
	readDeclaredPipeline,
} from "#server/pipeline-declaration-reading";
import {
	listedPipeline,
	newestRecords,
	stageNames,
} from "#server/pipeline-presentation";
import { recordedGroups, recordedRuns } from "#server/pipeline-source-records";
import type {
	DeclaredCases,
	DeclaredPipeline,
	ListedPipeline,
	PipelineReport,
	PlacedRan,
	Reading,
	RecordedGroup,
	RecordedRun,
	UnreadablePipelineRecord,
} from "#server/pipelines-contract";
import { redactAbsolutePaths } from "#server/redact-path";

interface PipelineRecordSources {
	readonly declared: DeclaredCases;
	readonly recorded: Reading<RecordedRun>;
	readonly grouped: Reading<RecordedGroup>;
}

interface PipelineListingSource {
	readonly declaration: DeclaredPipeline | undefined;
	readonly path: string;
	readonly ran: PlacedRan;
	readonly targets: ReadonlyMap<string, string>;
}

function pipelineListingSources({
	declared,
	recorded,
	grouped,
}: PipelineRecordSources): readonly PipelineListingSource[] {
	const declaredByPath = new Map(
		declared.found.map((pipeline) => [pipeline.path, pipeline]),
	);
	const runsByPath = Map.groupBy(
		recorded.found,
		({ manifest }) => manifest.pipelinePath,
	);
	const groupsByPath = Map.groupBy(
		grouped.found,
		({ pipelinePath }) => pipelinePath,
	);
	const paths = new Set([
		...declaredByPath.keys(),
		...runsByPath.keys(),
		...groupsByPath.keys(),
	]);

	return [...paths]
		.toSorted((left, right) => left.localeCompare(right))
		.map((path) => {
			const runs = runsByPath.get(path) ?? [];
			const groups = groupsByPath.get(path) ?? [];

			return {
				declaration: declaredByPath.get(path),
				path,
				ran: { groups, newest: newestRecords({ groups, runs }), runs },
				targets: declared.targets,
			};
		});
}

const NEWEST_RECORD_INDEX = 0;

interface PipelineEntryInput {
	readonly casesRoot: string;
	readonly source: PipelineListingSource;
}

type PipelineEntry =
	| { readonly kind: "listed"; readonly pipeline: ListedPipeline }
	| { readonly kind: "unreadable"; readonly problem: UnreadablePipelineRecord }
	| { readonly kind: "absent" };

async function readPipelineEntry({
	casesRoot,
	source,
}: PipelineEntryInput): Promise<PipelineEntry> {
	const { declaration, path, ran, targets } = source;
	if (declaration === undefined) {
		return recordedPipelineEntry(source);
	}

	try {
		const pipeline = await readDeclaredPipeline(
			casesRoot,
			declaration.declaration,
		);
		return {
			kind: "listed",
			pipeline: listedPipeline(
				{ declared: declaration, path, stages: stageNames(pipeline) },
				ran,
				targets,
			),
		};
	} catch (error) {
		if (
			!(error instanceof PipelineDefinitionError) &&
			!(error instanceof CaseDeclarationError)
		) {
			throw error;
		}

		return {
			kind: "unreadable",
			problem: { id: path, reason: redactAbsolutePaths(error.message) },
		};
	}
}

function recordedPipelineEntry({
	declaration,
	path,
	ran,
	targets,
}: PipelineListingSource): PipelineEntry {
	const stages = ran.newest[NEWEST_RECORD_INDEX]?.stages;
	return stages === undefined
		? { kind: "absent" }
		: {
				kind: "listed",
				pipeline: listedPipeline(
					{ declared: declaration, path, stages },
					ran,
					targets,
				),
			};
}

/**
 * Every pipeline a pipeline case declares as its default and every pipeline a
 * run manifest or pipeline confirmation group recorded, since a run may
 * override its case's default (doc-193 decision 1). A declared task's steps
 * are read from its file, as the design's task card shows its declaration. A
 * pipeline no case declares reads as its newest run or group ran it.
 */
async function pipelineReport(
	casesRoot: string,
	runsDirectory: string,
): Promise<PipelineReport> {
	const [declared, recorded, grouped] = await Promise.all([
		declaredPipelines(casesRoot),
		recordedRuns(runsDirectory),
		recordedGroups(runsDirectory),
	]);
	const sources = pipelineListingSources({ declared, grouped, recorded });
	const entries = await Array.fromAsync(
		sources,
		async (source) => await readPipelineEntry({ casesRoot, source }),
	);

	return {
		pipelines: entries.flatMap((entry) =>
			entry.kind === "listed" ? [entry.pipeline] : [],
		),
		unreadable: [
			...declared.unreadable,
			...recorded.unreadable,
			...grouped.unreadable,
			...entries.flatMap((entry) =>
				entry.kind === "unreadable" ? [entry.problem] : [],
			),
		],
	};
}

export { pipelineReport };

export {
	caseRubrics,
	checkedPipeline,
	declaredPipelineFile,
	readDeclaredPipeline,
} from "#server/pipeline-declaration-reading";

export type {
	DeclaringCase,
	PipelineFigures,
	ListedPipeline,
	UnreadablePipelineRecord,
	PipelineReport,
} from "#server/pipelines-contract";
