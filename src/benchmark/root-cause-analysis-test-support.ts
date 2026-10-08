import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ClaudeEnvelope } from "./contracts";
import type { CorpusMeasurement } from "./corpus-measurement";
import type { AnalysisResult } from "./root-cause-analysis";
import { analyzeRun } from "./root-cause-analysis";
import { measureCorpusVersion } from "./corpus-version";
import type { RunManifest } from "./manifest";
import { writeRunManifest } from "./manifest";
import type { ReadManifestEntry } from "./read-manifest";
import { benchmarkRunPaths } from "./run-layout";
import { nothingRunning } from "./run-records-test-support";

export const RUN = "2026-10-04T10-00-00.000Z";

const SOURCE_ROOT = "/fixture/target";

/** The corpus the fixture run read, by layout path. */
export const CORPUS_BODIES = {
	"CLAUDE.md": "# Global instructions\n",
	"skills/shape/SKILL.md": "# Shape\nWrite the card.\n",
	"skills/build/SKILL.md": "# Build\nWrite the code.\nCommit it.\n",
} as const;

function manifest(stages: readonly string[]): RunManifest {
	return {
		caseId: "audit-log",
		timestamp: "2026-10-04T10:00:00.000Z",
		controlSha: "1".repeat(40),
		sourceRoot: SOURCE_ROOT,
		sourceSha: "2".repeat(40),
		taskId: "ACT-1",
		taskSha: "3".repeat(40),
		task: "add an audit log module",
		productBrief: "the brief",
		model: "sonnet",
		judgeModel: "opus",
		sessionBudgetUsd: 5,
		pipelinePath: "cases/audit-log/pipelines/default.json",
		pipeline: {
			statuses: ["To Do", "Build", "Done"],
			target: {
				checks: [{ command: ["bun", "run", "typecheck"] }],
				integrityFiles: ["package.json"],
			},
			stages: stages.map((name) => ({
				name,
				kind: "delivery",
				skill: name,
				rubric: `${name}.json`,
			})),
		},
	};
}

export interface StageFixture {
	readonly stage: string;
	readonly status?: "STAGE_JUDGE_FAILED";
	readonly error?: string;
	readonly grade: {
		readonly grade: string;
		readonly verdict: string;
		readonly summary?: string;
	};
	readonly input: {
		readonly commitSubjects: readonly string[];
		readonly changedPaths: readonly string[];
		readonly diff: string;
	};
	readonly prompt: string;
	readonly summary?: string;
	readonly corpusVersion?: CorpusMeasurement;
	readonly readManifest?: readonly ReadManifestEntry[];
	readonly corpusFiles?: readonly {
		readonly path: string;
		readonly sha256: string;
	}[];
}

function readEntry(path: string): ReadManifestEntry {
	return {
		path,
		half: "corpus",
		role: "read for context",
		evidence: "declared and observed",
	};
}

const PROJECT_READ: ReadManifestEntry = {
	path: "README.md",
	half: "project",
	role: "read for context",
	evidence: "observed",
};

function stageInput(stage: string): StageFixture["input"] {
	return {
		commitSubjects: [`feat: ${stage} the audit log`],
		changedPaths: [`src/${stage}.ts`],
		diff: "a diff the bundle leaves out",
	};
}

export function gradedStage(
	stage: string,
	reads: readonly string[],
	corpusVersion: CorpusMeasurement,
): StageFixture {
	return {
		stage,
		grade: { grade: "B", verdict: "CONTINUE", summary: `${stage} held` },
		input: stageInput(stage),
		prompt: "a prompt the bundle leaves out",
		corpusVersion,
		readManifest: [...reads.map((path) => readEntry(path)), PROJECT_READ],
	};
}

/**
 * A stage the Judge stopped, in the layout the harness writes: the findings
 * sit beside the grade, and the grade holds only the letter and the verdict.
 */
export function stoppedStage(
	stage: string,
	reads: readonly string[],
	corpusVersion: CorpusMeasurement,
): StageFixture {
	return {
		...gradedStage(stage, reads, corpusVersion),
		status: "STAGE_JUDGE_FAILED",
		error: `${stage} stage graded D; minimum grade is B`,
		summary: `${stage} missed`,
		grade: { grade: "D", verdict: "STOP" },
	};
}

export async function writeStage(
	directory: string,
	record: StageFixture,
): Promise<void> {
	await Bun.write(
		benchmarkRunPaths(directory, RUN).stageFile(record.stage),
		`${JSON.stringify(record, null, 2)}\n`,
	);
}

/** Measures the fixture corpus into the records under `directory`. */
export async function measuredCorpus(
	directory: string,
	bodies: Readonly<Record<string, string>> = CORPUS_BODIES,
): Promise<CorpusMeasurement> {
	const root = join(directory, "corpus-source");
	for (const [path, body] of Object.entries(bodies)) {
		await mkdir(dirname(join(root, path)), { recursive: true });
		await writeFile(join(root, path), body);
	}

	return measureCorpusVersion(directory, { kind: "directory", root });
}

/** A run of shape, build and review whose shape stage was graded. */
export async function runWithOneGradedStage(
	directory: string,
	bodies: Readonly<Record<string, string>> = CORPUS_BODIES,
): Promise<CorpusMeasurement> {
	const corpusVersion = await measuredCorpus(directory, bodies);
	await writeRunManifest(
		benchmarkRunPaths(directory, RUN).manifestFile,
		manifest(["shape", "build", "review"]),
	);
	await writeStage(
		directory,
		gradedStage("shape", ["CLAUDE.md", "skills/shape/SKILL.md"], corpusVersion),
	);

	return corpusVersion;
}

/** A run of shape, build and review that stopped at build. */
export async function runStoppedAtBuild(
	directory: string,
	bodies: Readonly<Record<string, string>> = CORPUS_BODIES,
): Promise<CorpusMeasurement> {
	const corpusVersion = await runWithOneGradedStage(directory, bodies);
	await writeStage(
		directory,
		stoppedStage(
			"build",
			["CLAUDE.md", "skills/build/SKILL.md"],
			corpusVersion,
		),
	);

	return corpusVersion;
}

export const ANSWER = {
	rootCause: {
		stage: "build",
		file: "skills/build/SKILL.md",
		lines: { start: 2, end: 3 },
	},
	narrative: "the build skill never asks for a direct run",
	pairedRerun: "replay build with the run step restored",
	stages: [
		{
			stage: "shape",
			role: "not a factor",
			note: "the card was complete",
			contribution: "left the grade where it was",
		},
		{
			stage: "build",
			role: "root cause",
			note: "no direct run was recorded",
			contribution: "cost the observed-result requirement",
		},
	],
} as const;

export function answering(
	structuredOutput: ClaudeEnvelope["structured_output"],
): ClaudeEnvelope {
	return {
		session_id: "analysis-session",
		total_cost_usd: 0.24,
		structured_output: structuredOutput,
	};
}

/**
 * Records one analysis of the fixture run, started at the ISO `startedAt`. An
 * answer the harness refuses records a failed analysis.
 */
export function recordAnalysis(
	directory: string,
	startedAt: string,
	answer: ClaudeEnvelope["structured_output"] = ANSWER,
): Promise<AnalysisResult> {
	return analyzeRun(
		{ runsDirectory: directory, run: RUN, model: "sonnet", capUsd: 1 },
		{
			invoke: () => Promise.resolve(JSON.stringify(answering(answer))),
			now: () => new Date(startedAt),
			liveness: nothingRunning,
			requireSpendCeiling: () => Promise.resolve(30),
			progress: () => undefined,
		},
	);
}
