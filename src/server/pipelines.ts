import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { caseRelative, CaseDeclarationError, listCases } from "#benchmark/case";
import type { PipelineCaseDeclaration } from "#benchmark/case";
import { CONTROL_DIR } from "#benchmark/config";
import { loadRunManifest } from "#benchmark/manifest";
import type { RunManifest } from "#benchmark/manifest";
import { parsePipeline, PipelineDefinitionError } from "#benchmark/pipeline";
import type { StageDefinition } from "#benchmark/pipeline";
import { benchmarkRunPaths, recordedRunNames } from "#benchmark/run-layout";
import { redactAbsolutePaths } from "./redact-path";

/** The case whose declaration names a pipeline as its default. */
export interface DeclaringCase {
	readonly id: string;
	readonly title: string;
	readonly target: string;
}

/**
 * A task's runs as one corpus version produced them (doc-193 decision 4):
 * the runs at the latest version any of them recorded, and how many ran
 * under another version or recorded none. When no run recorded a version,
 * every run is counted and the version is null.
 */
export interface PipelineFigures {
	readonly counted: number;
	readonly corpusVersion: string | null;
	readonly leftOut: number;
}

/**
 * One pipeline file the harness can run or has run, the design's task, named
 * by its control-relative path (decision-5 keeps the route in pipeline and
 * stage words).
 */
export interface ListedPipeline {
	readonly path: string;
	readonly stages: readonly string[];
	readonly stageJudges: number;
	readonly taskJudges: number;
	/** Null for a pipeline only a run's override named. */
	readonly declaredBy: DeclaringCase | null;
	readonly cases: readonly string[];
	/** Every run that recorded this pipeline, newest first. */
	readonly runs: readonly string[];
	readonly figures: PipelineFigures;
}

export interface UnreadablePipelineRecord {
	readonly id: string;
	readonly reason: string;
}

export interface PipelineReport {
	readonly pipelines: readonly ListedPipeline[];
	readonly unreadable: readonly UnreadablePipelineRecord[];
}

interface RecordedRun {
	readonly name: string;
	readonly manifest: RunManifest;
}

interface Reading<T> {
	readonly found: readonly T[];
	readonly unreadable: readonly UnreadablePipelineRecord[];
}

async function recordedRuns(
	runsDirectory: string,
): Promise<Reading<RecordedRun>> {
	const found: RecordedRun[] = [];
	const unreadable: UnreadablePipelineRecord[] = [];
	const recorded = await recordedRunNames(runsDirectory);
	const names = recorded.toSorted((left, right) => right.localeCompare(left));
	for (const name of names) {
		const { manifestFile } = benchmarkRunPaths(runsDirectory, name);
		if (!(await Bun.file(manifestFile).exists())) {
			continue;
		}
		try {
			found.push({ name, manifest: await loadRunManifest(manifestFile) });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			unreadable.push({ id: name, reason: redactAbsolutePaths(message) });
		}
	}

	return { found, unreadable };
}

interface DeclaredPipeline {
	readonly path: string;
	readonly declaration: PipelineCaseDeclaration;
}

async function declaredPipelines(
	casesRoot: string,
): Promise<Reading<DeclaredPipeline>> {
	const listing = await listCases(casesRoot);
	const found: DeclaredPipeline[] = [];
	const unreadable: UnreadablePipelineRecord[] = [];
	for (const declaration of listing.declarations) {
		if (declaration.kind !== "pipeline") {
			continue;
		}
		try {
			found.push({
				path: relative(
					CONTROL_DIR,
					caseRelative(declaration, declaration.pipeline),
				),
				declaration,
			});
		} catch (error) {
			if (!(error instanceof CaseDeclarationError)) {
				throw error;
			}
			unreadable.push({
				id: declaration.id,
				reason: redactAbsolutePaths(error.message),
			});
		}
	}

	return { found, unreadable };
}

/**
 * The stages of a declared pipeline no run recorded, read from its file
 * through the harness's own parse, so a file the harness would refuse to run
 * is reported rather than listed. Its rubrics are named control-relative, as
 * the stages name them.
 */
async function declaredStages(
	casesRoot: string,
	declaration: PipelineCaseDeclaration,
): Promise<readonly StageDefinition[]> {
	const caseDirectory = join(casesRoot, declaration.id);
	const file = Bun.file(join(caseDirectory, declaration.pipeline));
	if (!(await file.exists())) {
		throw new PipelineDefinitionError(
			`Pipeline definition not found: ${declaration.pipeline}`,
		);
	}

	const rubricsDirectory = join(caseDirectory, declaration.rubrics);
	let rubricEntries: readonly string[];
	try {
		rubricEntries = await readdir(rubricsDirectory);
	} catch {
		throw new PipelineDefinitionError(
			`Rubrics directory cannot be read: ${declaration.rubrics}`,
		);
	}

	const availableRubrics = rubricEntries.map((entry) =>
		relative(
			CONTROL_DIR,
			caseRelative(declaration, join(declaration.rubrics, entry)),
		),
	);

	return parsePipeline(await file.text(), availableRubrics).stages;
}

function figuresOf(runs: readonly RecordedRun[]): PipelineFigures {
	const latest = runs
		.map(({ manifest }) => manifest.corpusVersion)
		.find((measurement) => measurement?.kind === "version");
	if (latest?.kind !== "version") {
		return { counted: runs.length, corpusVersion: null, leftOut: 0 };
	}

	const counted = runs.filter(
		({ manifest }) =>
			manifest.corpusVersion?.kind === "version" &&
			manifest.corpusVersion.digest === latest.digest,
	).length;

	return {
		counted,
		corpusVersion: latest.digest,
		leftOut: runs.length - counted,
	};
}

function listedPipeline(
	path: string,
	stages: readonly StageDefinition[],
	declared: DeclaredPipeline | undefined,
	runs: readonly RecordedRun[],
): ListedPipeline {
	const cases = new Set(runs.map(({ manifest }) => manifest.caseId));
	if (declared !== undefined) {
		cases.add(declared.declaration.id);
	}

	return {
		path,
		stages: stages.map(({ name }) => name),
		stageJudges: stages.length,
		taskJudges: declared === undefined ? 0 : 1,
		declaredBy:
			declared === undefined
				? null
				: {
						id: declared.declaration.id,
						title: declared.declaration.title,
						target: declared.declaration.target.path,
					},
		cases: [...cases].toSorted((left, right) => left.localeCompare(right)),
		runs: runs.map(({ name }) => name),
		figures: figuresOf(runs),
	};
}

/**
 * Every pipeline a pipeline case declares as its default and every pipeline a
 * run manifest recorded, since a run may override its case's default
 * (doc-193 decision 1). A recorded pipeline reads as its newest run ran it,
 * so a file changed or deleted since does not rewrite what ran.
 */
export async function pipelineReport(
	casesRoot: string,
	runsDirectory: string,
): Promise<PipelineReport> {
	const [declared, recorded] = await Promise.all([
		declaredPipelines(casesRoot),
		recordedRuns(runsDirectory),
	]);
	const declaredByPath = new Map(
		declared.found.map((pipeline) => [pipeline.path, pipeline]),
	);
	const runsByPath = Map.groupBy(
		recorded.found,
		({ manifest }) => manifest.pipelinePath,
	);
	const paths = new Set([...declaredByPath.keys(), ...runsByPath.keys()]);

	const pipelines: ListedPipeline[] = [];
	const unreadable = [...declared.unreadable, ...recorded.unreadable];
	for (const path of [...paths].toSorted((left, right) =>
		left.localeCompare(right),
	)) {
		const runs = runsByPath.get(path) ?? [];
		const declaration = declaredByPath.get(path);
		const [newest] = runs;
		if (newest !== undefined) {
			pipelines.push(
				listedPipeline(
					path,
					newest.manifest.pipeline.stages,
					declaration,
					runs,
				),
			);
			continue;
		}
		if (declaration === undefined) {
			continue;
		}
		try {
			pipelines.push(
				listedPipeline(
					path,
					await declaredStages(casesRoot, declaration.declaration),
					declaration,
					runs,
				),
			);
		} catch (error) {
			if (
				!(error instanceof PipelineDefinitionError) &&
				!(error instanceof CaseDeclarationError)
			) {
				throw error;
			}

			unreadable.push({ id: path, reason: redactAbsolutePaths(error.message) });
		}
	}

	return { pipelines, unreadable };
}
