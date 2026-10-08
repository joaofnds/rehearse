import { readdir } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { caseRelative, CaseDeclarationError, listCases } from "#benchmark/case";
import type { PipelineCaseDeclaration } from "#benchmark/case";
import { CONTROL_DIR } from "#benchmark/config";
import { parseConfirmationGroupRecord } from "#benchmark/confirmation-record";
import { loadRunManifest } from "#benchmark/manifest";
import type { RunManifest } from "#benchmark/manifest";
import { parsePipeline, PipelineDefinitionError } from "#benchmark/pipeline";
import { newestFirst } from "#benchmark/recorded-time";
import type { PipelineDefinition } from "#benchmark/pipeline";
import {
	benchmarkRunPaths,
	confirmationGroupIds,
	confirmationGroupPaths,
	recordedRunNames,
} from "#benchmark/run-layout";
import { atLatestCorpusVersion } from "./latest-corpus-version";
import { parseStageRubric } from "#benchmark/stage-grading";
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
	readonly startedAt: string | undefined;
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
 * Pipeline groups newest first by the time they started. A group written
 * before groups recorded one follows, in group id order, as the run history
 * orders its untimed groups, and file times are not trusted for it.
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
				startedAt: record.startedAt,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			unreadable.push({ id: groupId, reason: redactAbsolutePaths(message) });
		}
	}

	return {
		found: newestFirst(found, ({ startedAt }) => startedAt),
		unreadable,
	};
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
 * parse and rubric fit, so a file the harness would refuse to run throws
 * rather than reads,
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

	let text: string;
	try {
		text = await file.text();
	} catch (error) {
		throw new PipelineDefinitionError(
			`Pipeline definition cannot be read: ${declaration.pipeline}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	const pipeline = parsePipeline(text, availableRubrics);
	for (const stage of pipeline.stages) {
		const rubric = Bun.file(
			caseRelative(
				declaration,
				join(declaration.rubrics, basename(stage.rubric)),
				casesRoot,
			),
		);
		try {
			parseStageRubric(await rubric.text(), stage.kind);
		} catch (error) {
			throw new PipelineDefinitionError(
				`Pipeline stage ${stage.name} names a rubric it cannot use: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	return pipeline;
}

function stageNames(pipeline: PipelineDefinition): readonly string[] {
	return pipeline.stages.map(({ name }) => name);
}

/**
 * A run or a pipeline group as the task reads it: the steps it ran, the
 * corpus version it ran at, and how many runs it counts as, one per rep.
 */
interface RanRecord {
	readonly time: string | undefined;
	readonly stages: readonly string[];
	readonly runs: number;
	readonly corpusVersion: CorpusMeasurement;
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
				time: name,
				stages: stageNames(manifest.pipeline),
				runs: 1,
				corpusVersion: manifest.corpusVersion,
			})),
			...groups.map(({ startedAt, stages, reps, corpusVersion }) => ({
				time: startedAt,
				stages,
				runs: reps,
				corpusVersion,
			})),
		],
		({ time }) => time,
	);
}

/** The digest each record counts once per run, newest record first. */
function digestsOf(
	records: readonly RanRecord[],
): readonly (string | undefined)[] {
	const digest = (measurement: CorpusMeasurement): string | undefined =>
		measurement?.kind === "version" ? measurement.digest : undefined;

	return records.flatMap(({ runs, corpusVersion }) =>
		Array.from({ length: runs }, () => digest(corpusVersion)),
	);
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
		figures: figuresOf(digestsOf(newestRecords({ runs, groups }))),
	};
}

/**
 * Every pipeline a pipeline case declares as its default and every pipeline a
 * run manifest or pipeline confirmation group recorded, since a run may
 * override its case's default (doc-193 decision 1). A recorded pipeline reads
 * as its newest run or group ran it, so a file changed or deleted since does
 * not rewrite what ran, and its steps come from the same record as its version.
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
		const [newest] = newestRecords(ran);
		const recordedStages = newest?.stages;
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
