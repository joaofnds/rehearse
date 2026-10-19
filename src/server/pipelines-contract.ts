import type { PipelineCaseDeclaration } from "#benchmark/case";
import type { RunManifest } from "#benchmark/manifest";

/** The case whose declaration names a pipeline as its default. */
interface DeclaringCase {
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
interface PipelineFigures {
	readonly counted: number;
	readonly corpusVersion: string | null;
	readonly leftOut: number;
}

/**
 * One pipeline file the harness can run or has run, the design's task, named
 * by its control-relative path (decision-5 keeps the route in pipeline and
 * stage words).
 */
interface ListedPipeline {
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

interface UnreadablePipelineRecord {
	readonly id: string;
	readonly reason: string;
}

interface PipelineReport {
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

interface DeclaredPipeline {
	readonly path: string;
	readonly declaration: PipelineCaseDeclaration;
}

interface DeclaredCases extends Reading<DeclaredPipeline> {
	readonly targets: ReadonlyMap<string, string>;
}

/**
 * A run or a pipeline group as the task reads it: the steps it ran, the
 * corpus version it ran at, and how many runs it counts as, one per rep.
 */
interface RanRecord {
	readonly time: string | undefined;
	readonly stages: readonly string[];
	readonly countedRuns: number;
	readonly corpusVersion: CorpusMeasurement;
}

interface Ran {
	readonly runs: readonly RecordedRun[];
	readonly groups: readonly RecordedGroup[];
}

/** What a task ran, with its runs and groups placed newest first once. */
interface PlacedRan extends Ran {
	readonly newest: readonly RanRecord[];
}

interface ListedPipelineDefinition {
	readonly path: string;
	readonly stages: readonly string[];
	readonly declared: DeclaredPipeline | undefined;
}

export type {
	DeclaringCase,
	PipelineFigures,
	ListedPipeline,
	UnreadablePipelineRecord,
	PipelineReport,
	RecordedRun,
	CorpusMeasurement,
	RecordedGroup,
	Reading,
	DeclaredPipeline,
	DeclaredCases,
	RanRecord,
	Ran,
	PlacedRan,
	ListedPipelineDefinition,
};
