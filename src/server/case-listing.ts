import { CaseDeclarationError, listCases } from "#benchmark/case";
import type {
	PipelineCaseDeclaration,
	SessionCaseDeclaration,
} from "#benchmark/case";
import { PipelineDefinitionError } from "#benchmark/pipeline";
import type { RunLiveness } from "#benchmark/run-liveness";
import { caseFigures, medianVerdict } from "./case-figures";
import type { CaseFigures, CaseRun } from "./case-figures";
import { readCaseRuns } from "./case-runs";
import type { RecordedCase, UnreadableCaseRecord } from "./case-runs";
import { readDeclaredPipeline } from "./pipelines";
import { redactAbsolutePaths } from "./redact-path";

export interface ListedStep {
	readonly name: string;
	readonly rubric: string;
}

export type StepsReading =
	| { readonly state: "available"; readonly stages: readonly ListedStep[] }
	| { readonly state: "unavailable"; readonly reason: string };

/** A pipeline case's figures add the median of its final Judge's verdicts. */
export type PipelineCaseFigures =
	| Extract<CaseFigures, { state: "no-runs" }>
	| (Extract<CaseFigures, { state: "measured" }> & {
			readonly median: "PASS" | "FAIL" | null;
	  });

/**
 * The newest pipeline run's minimum grade. Null for a case nothing ran, and
 * not recorded where that run lacks one or only groups ran the case, since a
 * group record holds none.
 */
export type LatestMinimumGrade =
	| { readonly state: "recorded"; readonly letter: string }
	| { readonly state: "not-recorded" }
	| null;

interface ListedCaseIdentity {
	readonly id: string;
	readonly title: string;
	readonly model: string | null;
}

export interface ListedPipelineCase extends ListedCaseIdentity {
	readonly kind: "pipeline";
	readonly target: string;
	readonly steps: StepsReading;
	readonly finalRubric: string;
	readonly figures: PipelineCaseFigures;
	readonly latestMinimumGrade: LatestMinimumGrade;
}

/**
 * A session case runs against no repository and its declared checks judge
 * it, so its figures count the runs whose checks passed and carry no letter.
 */
export interface ListedSessionCase extends ListedCaseIdentity {
	readonly kind: "session";
	readonly target: null;
	readonly checks: readonly string[];
	readonly figures: CaseFigures;
}

export type ListedCase = ListedPipelineCase | ListedSessionCase;

export interface UnreadableDeclaration {
	readonly id: string;
	readonly reason: string;
}

export interface CaseListing {
	readonly cases: readonly ListedCase[];
	/** Declarations that do not parse. */
	readonly unreadable: readonly UnreadableDeclaration[];
	/** Run records the figures could not read. */
	readonly unreadableRecords: readonly UnreadableCaseRecord[];
}

const NO_RUNS: readonly CaseRun[] = [];

async function steps(
	casesRoot: string,
	declaration: PipelineCaseDeclaration,
): Promise<StepsReading> {
	try {
		const pipeline = await readDeclaredPipeline(casesRoot, declaration);

		return {
			state: "available",
			stages: pipeline.stages.map(({ name, rubric }) => ({ name, rubric })),
		};
	} catch (error) {
		if (
			!(error instanceof PipelineDefinitionError) &&
			!(error instanceof CaseDeclarationError)
		) {
			throw error;
		}

		return {
			state: "unavailable",
			reason: redactAbsolutePaths(error.message),
		};
	}
}

function pipelineFigures(runs: readonly CaseRun[]): PipelineCaseFigures {
	const figures = caseFigures(runs);
	if (figures.state === "no-runs") {
		return figures;
	}

	return { ...figures, median: medianVerdict(figures.passed, figures.judged) };
}

function latestMinimumGrade(
	recorded: RecordedCase | undefined,
): LatestMinimumGrade {
	if (recorded === undefined) {
		return null;
	}

	const { minimumGrade } = recorded;

	return minimumGrade?.state === "available"
		? { state: "recorded", letter: minimumGrade.letter }
		: { state: "not-recorded" };
}

async function listedPipelineCase(
	casesRoot: string,
	declaration: PipelineCaseDeclaration,
	recorded: RecordedCase | undefined,
): Promise<ListedPipelineCase> {
	return {
		id: declaration.id,
		kind: "pipeline",
		title: declaration.title,
		model: declaration.model ?? null,
		target: declaration.target.path,
		steps: await steps(casesRoot, declaration),
		finalRubric: declaration.finalRubric,
		figures: pipelineFigures(recorded?.runs ?? NO_RUNS),
		latestMinimumGrade: latestMinimumGrade(recorded),
	};
}

function listedSessionCase(
	declaration: SessionCaseDeclaration,
	recorded: RecordedCase | undefined,
): ListedSessionCase {
	return {
		id: declaration.id,
		kind: "session",
		title: declaration.title,
		model: declaration.model ?? null,
		target: null,
		checks: declaration.checks.map(({ kind }) => kind),
		figures: caseFigures(recorded?.runs ?? NO_RUNS),
	};
}

/**
 * Every declared case with what defines it and its figures over its
 * recorded runs (doc-193 decisions 3 and 4).
 */
export async function caseListing(
	casesRoot: string,
	runsDirectory: string,
	liveness: RunLiveness,
): Promise<CaseListing> {
	const [listing, recorded] = await Promise.all([
		listCases(casesRoot),
		readCaseRuns(runsDirectory, liveness),
	]);
	const cases: ListedCase[] = [];
	for (const declaration of listing.declarations) {
		const ran = recorded.cases.get(declaration.id);
		cases.push(
			declaration.kind === "pipeline"
				? await listedPipelineCase(casesRoot, declaration, ran)
				: listedSessionCase(declaration, ran),
		);
	}

	return {
		cases,
		unreadable: listing.unreadable.map(({ id, reason }) => ({
			id,
			reason: redactAbsolutePaths(reason),
		})),
		unreadableRecords: recorded.unreadable,
	};
}
