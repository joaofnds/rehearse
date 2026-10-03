import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import {
	ClaudeSessionError,
	readClaudeEnvelope,
	readStructuredOutput,
} from "./claude";
import type { ClaudeEnvelope, Immutable } from "./contracts";
import { loadRunManifest } from "./manifest";
import { readManifestSchema } from "./read-manifest";
import type { RunLiveness } from "./run-liveness";
import {
	benchmarkRunPaths,
	culpritAnalysesDirectory,
	runNameFromTimestamp,
} from "./run-layout";

export type AnalysisInvoker = (
	prompt: string,
	budgetUsd: number,
) => Promise<string>;

export interface AnalysisRequest {
	readonly runsDirectory: string;
	readonly run: string;
	readonly model: string;
	readonly capUsd: number;
}

export interface AnalysisDependencies {
	readonly invoke: AnalysisInvoker;
	readonly now: () => Date;
	readonly liveness: RunLiveness;
	readonly requireSpendCeiling: (recordsDirectory: string) => Promise<number>;
}

const AGENT_STEP_ROLES = [
	"not implicated",
	"contributing",
	"primary culprit",
] as const;

const answerSchema = z
	.object({
		culprit: z
			.object({
				step: z.string().min(1),
				file: z.string().min(1),
				lines: z
					.object({
						start: z.int().positive(),
						end: z.int().positive(),
					})
					.strict()
					.optional(),
			})
			.strict()
			.nullable(),
		narrative: z.string().min(1),
		pairedRerun: z.string().min(1),
		steps: z.array(
			z
				.object({
					step: z.string().min(1),
					role: z.enum(AGENT_STEP_ROLES),
					note: z.string().min(1),
					contribution: z.string().min(1),
				})
				.strict(),
		),
	})
	.strict();

type AnalysisAnswer = Immutable<z.infer<typeof answerSchema>>;

export type StepReading =
	| AnalysisAnswer["steps"][number]
	| { readonly step: string; readonly role: "never ran" };

interface AnalysisBase {
	readonly schemaVersion: 1;
	readonly run: string;
	readonly model: string;
	readonly capUsd: number;
	readonly startedAt: string;
	readonly durationMs: number;
	readonly costUsd?: number;
}

export interface RecordedAnalysis extends AnalysisBase {
	readonly outcome: "recorded";
	readonly culprit: AnalysisAnswer["culprit"];
	readonly narrative: string;
	readonly pairedRerun: string;
	readonly steps: readonly StepReading[];
}

/**
 * An answer the harness refused, or a session that gave none, is still a
 * paid call: the record keeps why it failed, what it cost and whatever the
 * session returned.
 */
export interface FailedAnalysis extends AnalysisBase {
	readonly outcome: "failed";
	readonly reason: string;
	readonly payload?: unknown;
}

export type CulpritAnalysisRecord = RecordedAnalysis | FailedAnalysis;

export interface AnalysisResult {
	readonly file: string;
	readonly record: CulpritAnalysisRecord;
}

const stageRecordSchema = z
	.object({
		readManifest: readManifestSchema.optional(),
		corpusFiles: z
			.array(z.object({ path: z.string().min(1) }).loose())
			.optional(),
	})
	.loose();

/** A step that wrote a stage record, with the corpus files it read. */
interface RanStep {
	readonly step: string;
	readonly corpusReads: readonly string[];
}

interface FailedReading {
	readonly kind: "failed";
	readonly reason: string;
	readonly payload?: unknown;
	readonly costUsd: number | undefined;
}

type SessionReading =
	| {
			readonly kind: "answered";
			readonly answer: AnalysisAnswer;
			readonly payload: unknown;
			readonly costUsd: number | undefined;
	  }
	| FailedReading;

/**
 * Asks one sealed session which corpus file the run's outcome traces to, and
 * keeps its answer as a record of its own beside the run's records.
 */
export async function analyzeRun(
	request: AnalysisRequest,
	dependencies: AnalysisDependencies,
): Promise<AnalysisResult> {
	const paths = benchmarkRunPaths(request.runsDirectory, request.run);
	const manifest = await loadRunManifest(paths.manifestFile);
	const steps = manifest.pipeline.stages.map(({ name }) => name);
	const ran = await stepsThatRan(steps, paths.stageFile);

	const started = dependencies.now();
	const reading = await readSession(
		dependencies.invoke,
		JSON.stringify({ steps: ran }),
		request.capUsd,
	);
	const finished = dependencies.now();

	const base = {
		schemaVersion: 1,
		run: request.run,
		model: request.model,
		capUsd: request.capUsd,
		startedAt: started.toISOString(),
		durationMs: finished.getTime() - started.getTime(),
	} as const;
	let record: CulpritAnalysisRecord;
	if (reading.kind === "failed") {
		record = failedRecord(base, reading);
	} else {
		const violation = answerViolation(reading.answer, ran);
		record =
			violation === undefined
				? recordedAnalysis(base, reading.answer, steps)
				: failedRecord(base, { ...reading, kind: "failed", reason: violation });
	}

	return writeAnalysis(
		request.runsDirectory,
		withCost(record, reading.costUsd),
	);
}

async function readSession(
	invoke: AnalysisInvoker,
	prompt: string,
	budgetUsd: number,
): Promise<SessionReading> {
	let envelope: ClaudeEnvelope;
	try {
		envelope = readClaudeEnvelope(await invoke(prompt, budgetUsd));
	} catch (error) {
		return {
			kind: "failed",
			reason: error instanceof Error ? error.message : String(error),
			costUsd: error instanceof ClaudeSessionError ? error.costUsd : undefined,
		};
	}

	const payload = envelope.structured_output ?? envelope.result;
	try {
		return {
			kind: "answered",
			answer: readStructuredOutput(envelope, answerSchema),
			payload,
			costUsd: envelope.total_cost_usd,
		};
	} catch (error) {
		return {
			kind: "failed",
			reason:
				error instanceof z.ZodError ? z.prettifyError(error) : String(error),
			payload,
			costUsd: envelope.total_cost_usd,
		};
	}
}

/**
 * The rules an answer must keep to be recorded: it reads exactly the steps
 * that ran, at most one of them is the primary culprit and it is the step the
 * culprit names, and the culprit file is one that step read.
 */
function answerViolation(
	answer: AnalysisAnswer,
	ran: readonly RanStep[],
): string | undefined {
	const answered = answer.steps.map(({ step }) => step).toSorted();
	const expected = ran.map(({ step }) => step).toSorted();
	if (answered.join("\n") !== expected.join("\n")) {
		return `The answer reads steps ${answered.join(", ")}, but the steps that ran are ${expected.join(", ")}`;
	}

	const primaries = answer.steps.filter(
		({ role }) => role === "primary culprit",
	);
	if (answer.culprit === null) {
		return primaries.length === 0
			? undefined
			: "The answer names a primary culprit step without a culprit";
	}

	const { step, file } = answer.culprit;
	if (primaries.length !== 1 || primaries[0]?.step !== step) {
		return `The answer names ${step} as the culprit step, so ${step} and no other step must be the primary culprit`;
	}

	const culpritStep = ran.find((candidate) => candidate.step === step);
	if (culpritStep === undefined || !culpritStep.corpusReads.includes(file)) {
		return `The culprit file ${file} is not a corpus file the ${step} step read`;
	}

	return undefined;
}

function recordedAnalysis(
	base: Omit<AnalysisBase, "costUsd">,
	answer: AnalysisAnswer,
	steps: readonly string[],
): RecordedAnalysis {
	return {
		...base,
		outcome: "recorded",
		culprit: answer.culprit,
		narrative: answer.narrative,
		pairedRerun: answer.pairedRerun,
		steps: steps.map(
			(step) =>
				answer.steps.find((reading) => reading.step === step) ?? {
					step,
					role: "never ran",
				},
		),
	};
}

function failedRecord(
	base: Omit<AnalysisBase, "costUsd">,
	reading: FailedReading,
): FailedAnalysis {
	if (reading.payload === undefined) {
		return { ...base, outcome: "failed", reason: reading.reason };
	}

	return {
		...base,
		outcome: "failed",
		reason: reading.reason,
		payload: reading.payload,
	};
}

/**
 * Created exclusively, so a second analysis of the same run is a record of
 * its own and never replaces the first.
 */
async function writeAnalysis(
	runsDirectory: string,
	record: CulpritAnalysisRecord,
): Promise<AnalysisResult> {
	const file = join(
		culpritAnalysesDirectory(runsDirectory),
		record.run,
		`${runNameFromTimestamp(record.startedAt)}.json`,
	);
	await mkdir(dirname(file), { recursive: true });
	await writeFile(file, `${JSON.stringify(record, null, 2)}\n`, {
		flag: "wx",
	});

	return { file, record };
}

/** A provider that reports no spend leaves the record without one. */
function withCost(
	record: CulpritAnalysisRecord,
	costUsd: number | undefined,
): CulpritAnalysisRecord {
	if (costUsd === undefined) {
		return record;
	}

	return { ...record, costUsd };
}

/**
 * A record written before the harness kept a read manifest names only the
 * corpus files the step was given, so those stand in for what it read.
 */
async function stepsThatRan(
	steps: readonly string[],
	stageFile: (stage: string) => string,
): Promise<readonly RanStep[]> {
	const ran: RanStep[] = [];
	for (const step of steps) {
		const file = Bun.file(stageFile(step));
		if (!(await file.exists())) {
			continue;
		}

		const record = stageRecordSchema.parse(await file.json());
		const corpusReads =
			record.readManifest
				?.filter(({ half }) => half === "corpus")
				.map(({ path }) => path) ??
			record.corpusFiles?.map(({ path }) => path) ??
			[];
		ran.push({ step, corpusReads });
	}

	return ran;
}
