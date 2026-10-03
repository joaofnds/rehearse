import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { readClaudeEnvelope, readStructuredOutput } from "./claude";
import { loadRunManifest } from "./manifest";
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

type AnalysisAnswer = z.infer<typeof answerSchema>;

export type StepReading =
	| AnalysisAnswer["steps"][number]
	| { readonly step: string; readonly role: "never ran" };

export interface CulpritAnalysisRecord {
	readonly schemaVersion: 1;
	readonly outcome: "recorded";
	readonly run: string;
	readonly model: string;
	readonly capUsd: number;
	readonly startedAt: string;
	readonly durationMs: number;
	readonly costUsd?: number;
	readonly culprit: AnalysisAnswer["culprit"];
	readonly narrative: string;
	readonly pairedRerun: string;
	readonly steps: readonly StepReading[];
}

export interface AnalysisResult {
	readonly file: string;
	readonly record: CulpritAnalysisRecord;
}

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
	const output = await dependencies.invoke(
		JSON.stringify({ steps: ran }),
		request.capUsd,
	);
	const finished = dependencies.now();

	const envelope = readClaudeEnvelope(output);
	const answer = readStructuredOutput(envelope, answerSchema);
	const record = withCost(
		{
			schemaVersion: 1,
			outcome: "recorded",
			run: request.run,
			model: request.model,
			capUsd: request.capUsd,
			startedAt: started.toISOString(),
			durationMs: finished.getTime() - started.getTime(),
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
		} satisfies CulpritAnalysisRecord,
		envelope.total_cost_usd,
	);

	const file = join(
		culpritAnalysesDirectory(request.runsDirectory),
		request.run,
		`${runNameFromTimestamp(record.startedAt)}.json`,
	);
	await mkdir(dirname(file), { recursive: true });
	await writeFile(file, `${JSON.stringify(record, null, 2)}\n`, {
		flag: "wx",
	});

	return { file, record };
}

/** A provider that reports no spend leaves the record without one. */
function withCost<Record extends object>(
	record: Record,
	costUsd: number | undefined,
): Record & { readonly costUsd?: number } {
	if (costUsd === undefined) {
		return record;
	}

	return { ...record, costUsd };
}

async function stepsThatRan(
	steps: readonly string[],
	stageFile: (stage: string) => string,
): Promise<readonly string[]> {
	const ran: string[] = [];
	for (const step of steps) {
		if (await Bun.file(stageFile(step)).exists()) {
			ran.push(step);
		}
	}

	return ran;
}
