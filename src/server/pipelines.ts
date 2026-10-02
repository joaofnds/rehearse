import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { caseRelative, CaseDeclarationError, listCases } from "#benchmark/case";
import type { PipelineCaseDeclaration } from "#benchmark/case";
import { CONTROL_DIR } from "#benchmark/config";
import { parseConfirmationGroupRecord } from "#benchmark/confirmation-record";
import { loadRunManifest } from "#benchmark/manifest";
import type { RunManifest } from "#benchmark/manifest";
import { parsePipeline, PipelineDefinitionError } from "#benchmark/pipeline";
import type { PipelineDefinition } from "#benchmark/pipeline";
import {
	benchmarkRunPaths,
	confirmationGroupIds,
	confirmationGroupPaths,
	recordedRunNames,
} from "#benchmark/run-layout";
import { atLatestCorpusVersion } from "./latest-corpus-version";
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
 * under another version or recorded none. A pipeline confirmation group's
 * reps count as runs each. When no run recorded a version, every run is
 * counted and the version is null.
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
	/**
	 * The targets of those cases that are still declared, so a pipeline only
	 * an override chose still names what it ran against.
	 */
	readonly targets: readonly string[];
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

type CorpusMeasurement = RunManifest["corpusVersion"];

/**
 * A pipeline confirmation group: reps that each ran the whole pipeline at the
 * corpus version the group froze.
 */
interface RecordedGroup {
	readonly caseId: string;
	readonly pipelinePath: string;
	readonly stages: readonly string[];
	readonly reps: number;
	readonly corpusVersion: CorpusMeasurement;
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

/**
 * Group and rep records carry no time, so groups cannot be placed among runs
 * by when they ran. They read after every run, in group id order, as the run
 * history orders its untimed groups, and file times are not trusted for it.
 */
async function recordedGroups(
	runsDirectory: string,
): Promise<Reading<RecordedGroup>> {
	const found: RecordedGroup[] = [];
	const unreadable: UnreadablePipelineRecord[] = [];
	const recorded = await confirmationGroupIds(runsDirectory);
	for (const groupId of recorded.toSorted((left, right) =>
		left.localeCompare(right),
	)) {
		const file = Bun.file(
			confirmationGroupPaths(runsDirectory, groupId).groupFile,
		);
		if (!(await file.exists())) {
			continue;
		}

		try {
			const record = parseConfirmationGroupRecord(await file.text());
			if (record.mode !== "pipeline") {
				continue;
			}

			found.push({
				caseId: record.caseId,
				pipelinePath: record.inputs.pipelinePath,
				stages: record.declaredStages,
				reps: record.reps,
				corpusVersion: record.inputs.corpusVersion,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			unreadable.push({ id: groupId, reason: redactAbsolutePaths(message) });
		}
	}

	return { found, unreadable };
}

interface DeclaredPipeline {
	readonly path: string;
	readonly declaration: PipelineCaseDeclaration;
}

interface DeclaredCases extends Reading<DeclaredPipeline> {
	readonly targets: ReadonlyMap<string, string>;
}

async function declaredPipelines(casesRoot: string): Promise<DeclaredCases> {
	const listing = await listCases(casesRoot);
	const found: DeclaredPipeline[] = [];
	const targets = new Map<string, string>();
	const unreadable = listing.unreadable.map(({ id, reason }) => ({
		id,
		reason: redactAbsolutePaths(reason),
	}));

	for (const declaration of listing.declarations) {
		if (declaration.kind !== "pipeline") {
			continue;
		}

		targets.set(declaration.id, declaration.target.path);
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

	return { found, unreadable, targets };
}

/**
 * A case's declared pipeline, read from its file through the harness's own
 * parse, so a file the harness would refuse to run throws rather than reads,
 * and a path outside the case directory throws before anything opens it.
 * Its rubrics are named control-relative, as the stages name them.
 */
export async function readDeclaredPipeline(
	casesRoot: string,
	declaration: PipelineCaseDeclaration,
): Promise<PipelineDefinition> {
	const file = Bun.file(
		caseRelative(declaration, declaration.pipeline, casesRoot),
	);
	if (!(await file.exists())) {
		throw new PipelineDefinitionError(
			`Pipeline definition not found: ${declaration.pipeline}`,
		);
	}

	const rubricsDirectory = caseRelative(
		declaration,
		declaration.rubrics,
		casesRoot,
	);
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

	return parsePipeline(await file.text(), availableRubrics);
}

function stageNames(pipeline: PipelineDefinition): readonly string[] {
	return pipeline.stages.map(({ name }) => name);
}

/** The digest of each run, newest first, with a group's reps after the runs. */
function digestsOf(
	runs: readonly RecordedRun[],
	groups: readonly RecordedGroup[],
): readonly (string | undefined)[] {
	const digest = (measurement: CorpusMeasurement): string | undefined =>
		measurement?.kind === "version" ? measurement.digest : undefined;

	return [
		...runs.map(({ manifest }) => digest(manifest.corpusVersion)),
		...groups.flatMap(({ reps, corpusVersion }) =>
			Array.from({ length: reps }, () => digest(corpusVersion)),
		),
	];
}

function figuresOf(digests: readonly (string | undefined)[]): PipelineFigures {
	const { counted, corpusVersion, leftOut } = atLatestCorpusVersion(
		digests,
		(digest) => digest,
	);

	return { counted: counted.length, corpusVersion, leftOut };
}

interface Ran {
	readonly runs: readonly RecordedRun[];
	readonly groups: readonly RecordedGroup[];
}

function listedPipeline(
	path: string,
	stages: readonly string[],
	declared: DeclaredPipeline | undefined,
	{ runs, groups }: Ran,
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
		path,
		stages,
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
		cases: sortedCases,
		targets: [...targets],
		runs: runs.map(({ name }) => name),
		figures: figuresOf(digestsOf(runs, groups)),
	};
}

/**
 * Every pipeline a pipeline case declares as its default and every pipeline a
 * run manifest or pipeline confirmation group recorded, since a run may
 * override its case's default (doc-193 decision 1). A recorded pipeline reads
 * as its newest run ran it, else as its first group declared it, so a file
 * changed or deleted since does not rewrite what ran.
 */
export async function pipelineReport(
	casesRoot: string,
	runsDirectory: string,
): Promise<PipelineReport> {
	const [declared, recorded, grouped] = await Promise.all([
		declaredPipelines(casesRoot),
		recordedRuns(runsDirectory),
		recordedGroups(runsDirectory),
	]);
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

	const pipelines: ListedPipeline[] = [];
	const unreadable = [
		...declared.unreadable,
		...recorded.unreadable,
		...grouped.unreadable,
	];
	for (const path of [...paths].toSorted((left, right) =>
		left.localeCompare(right),
	)) {
		const ran = {
			runs: runsByPath.get(path) ?? [],
			groups: groupsByPath.get(path) ?? [],
		};
		const declaration = declaredByPath.get(path);
		const [newestRun] = ran.runs;
		const [firstGroup] = ran.groups;
		const recordedStages =
			newestRun?.manifest.pipeline.stages.map(({ name }) => name) ??
			firstGroup?.stages;
		if (recordedStages !== undefined) {
			pipelines.push(
				listedPipeline(
					path,
					recordedStages,
					declaration,
					ran,
					declared.targets,
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
					stageNames(
						await readDeclaredPipeline(casesRoot, declaration.declaration),
					),
					declaration,
					ran,
					declared.targets,
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
