import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { CorpusMeasurement } from "./corpus-measurement";
import { measureCorpusVersion } from "./corpus-version";
import type { RunManifest } from "./manifest";
import { writeRunManifest } from "./manifest";
import orderedJson from "./ordered-json";
import type { ReadManifestEntry } from "./read-manifest";
import { benchmarkRunPaths } from "./run-layout";

const GIT_SHA1_HEX_DIGITS = 40;

const RUN = "2026-10-04T10-00-00.000Z";

const SOURCE_ROOT = "/fixture/target";

/** The corpus the fixture run read, by layout path. */
const CORPUS_BODIES = {
	"CLAUDE.md": "# Global instructions\n",
	"skills/build/SKILL.md": "# Build\nWrite the code.\nCommit it.\n",
	"skills/shape/SKILL.md": "# Shape\nWrite the card.\n",
} as const;

function manifest(stages: readonly string[]): RunManifest {
	return {
		caseId: "audit-log",
		controlSha: "1".repeat(GIT_SHA1_HEX_DIGITS),
		judgeModel: "opus",
		model: "sonnet",
		pipeline: {
			stages: stages.map((name) => ({
				kind: "delivery",
				name,
				rubric: `${name}.json`,
				skill: name,
			})),
			statuses: ["To Do", "Build", "Done"],
			target: {
				checks: [{ command: ["bun", "run", "typecheck"] }],
				integrityFiles: ["package.json"],
			},
		},
		pipelinePath: "cases/audit-log/pipelines/default.json",
		productBrief: "the brief",
		sessionBudgetUsd: 5,
		sourceRoot: SOURCE_ROOT,
		sourceSha: "2".repeat(GIT_SHA1_HEX_DIGITS),
		task: "add an audit log module",
		taskId: "ACT-1",
		taskSha: "3".repeat(GIT_SHA1_HEX_DIGITS),
		timestamp: "2026-10-04T10:00:00.000Z",
	};
}

interface StageFixture {
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
		evidence: "declared and observed",
		half: "corpus",
		path,
		role: "read for context",
	};
}

const PROJECT_READ: ReadManifestEntry = {
	evidence: "observed",
	half: "project",
	path: "README.md",
	role: "read for context",
};

function stageInput(stage: string): StageFixture["input"] {
	return {
		changedPaths: [`src/${stage}.ts`],
		commitSubjects: [`feat: ${stage} the audit log`],
		diff: "a diff the bundle leaves out",
	};
}

function gradedStage(
	stage: string,
	reads: readonly string[],
	corpusVersion: CorpusMeasurement,
): StageFixture {
	return {
		corpusVersion,
		grade: { grade: "B", summary: `${stage} held`, verdict: "CONTINUE" },
		input: stageInput(stage),
		prompt: "a prompt the bundle leaves out",
		readManifest: [...reads.map((path) => readEntry(path)), PROJECT_READ],
		stage,
	};
}

/**
 * A stage the Judge stopped, in the layout the harness writes: the findings
 * sit beside the grade, and the grade holds only the letter and the verdict.
 */
function stoppedStage(
	stage: string,
	reads: readonly string[],
	corpusVersion: CorpusMeasurement,
): StageFixture {
	return {
		...gradedStage(stage, reads, corpusVersion),
		error: `${stage} stage graded D; minimum grade is B`,
		grade: { grade: "D", verdict: "STOP" },
		status: "STAGE_JUDGE_FAILED",
		summary: `${stage} missed`,
	};
}

async function writeStage(
	directory: string,
	record: StageFixture,
): Promise<void> {
	const json = JSON.stringify(record);
	const text = orderedJson({
		json,
		order: {
			children: {
				corpusFiles: { fields: ["path", "sha256"] },
				corpusVersion: { fields: ["kind", "digest", "refusal"] },
				grade: { fields: ["grade", "verdict", "summary"] },
				input: { fields: ["commitSubjects", "changedPaths", "diff"] },
				readManifest: {
					fields: ["path", "half", "role", "evidence", "sha256"],
				},
			},
			fields: [
				"stage",
				"grade",
				"input",
				"prompt",
				"corpusVersion",
				"readManifest",
				"status",
				"error",
				"summary",
				"corpusFiles",
			],
		},
	});
	await Bun.write(
		benchmarkRunPaths(directory, RUN).stageFile(record.stage),
		`${text}\n`,
	);
}

/** Measures the fixture corpus into the records under `directory`. */
async function measuredCorpus(
	directory: string,
	bodies: Readonly<Record<string, string>> = CORPUS_BODIES,
): Promise<CorpusMeasurement> {
	const root = join(directory, "corpus-source");
	await Array.fromAsync(Object.entries(bodies), async ([path, body]) => {
		await mkdir(dirname(join(root, path)), { recursive: true });
		await writeFile(join(root, path), body);
	});

	return await measureCorpusVersion(directory, { kind: "directory", root });
}

/** A run of shape, build and review whose shape stage was graded. */
async function runWithOneGradedStage(
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
async function runStoppedAtBuild(
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

/**
 * Records one analysis of the fixture run, started at the ISO `startedAt`. An
 * answer the harness refuses records a failed analysis.
 */

/** Installs nothing, so a test's process signals stay at their default. */
function noSignalHandling(): () => void {
	return () => {
		// Nothing was installed, so nothing is released.
	};
}

export {
	RUN,
	noSignalHandling,
	CORPUS_BODIES,
	gradedStage,
	stoppedStage,
	writeStage,
	measuredCorpus,
	runWithOneGradedStage,
	runStoppedAtBuild,
};
export type { StageFixture };
