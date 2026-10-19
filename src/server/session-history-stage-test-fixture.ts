import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { CheckpointRecord } from "#benchmark/checkpoint-record-test-builder";
import CheckpointRecordBuilder from "#benchmark/checkpoint-record-test-builder";
import type { Immutable } from "#benchmark/contracts";
import { writeRunManifest } from "#benchmark/manifest";
import { benchmarkRunPaths } from "#benchmark/run-layout";
import { TEST_TARGET } from "#benchmark/test-support";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";
import { historyRunsDirectory } from "#server/session-history-workspace-test-fixture";

interface StageFixture {
	readonly runsDirectory: string;
	readonly run: string;
	readonly stage: string;
	readonly caseId: string;
}

const STAGE_TRANSCRIPT = [
	JSON.stringify({
		cwd: "/wt",
		message: {
			content: [
				{
					id: "read-1",
					input: { file_path: `${homedir()}/.claude/CLAUDE.md` },
					name: "Read",
					type: "tool_use",
				},
			],
		},
		type: "assistant",
	}),
	JSON.stringify({
		cwd: "/wt",
		message: {
			content: [
				{
					content: "1\tcorpus instructions",
					tool_use_id: "read-1",
					type: "tool_result",
				},
			],
		},
		type: "user",
	}),
].join("\n");

type StageTranscriptMode = "available" | "unavailable" | "absent";

function transcriptEvidence(
	mode: StageTranscriptMode,
): CheckpointRecord["transcript"] {
	if (mode === "available") {
		return {
			file: "transcript.jsonl",
			sessionId: "session-1",
			status: "AVAILABLE",
		};
	}
	if (mode === "unavailable") {
		return { sessionId: "session-1", status: "UNAVAILABLE" };
	}

	return undefined;
}

const STAGE_CHECKPOINT_FIELDS = {
	artifacts: [],
	corpusFiles: [
		{ path: "CLAUDE.md", sha256: "a".repeat(SHA256_HEX_DIGITS) },
		{ path: "skills/build/SKILL.md", sha256: "b".repeat(SHA256_HEX_DIGITS) },
	],
	lineage: "lineage-1",
	model: "sonnet",
	stage: "shape",
	targetSha: "target-sha",
	upstream: "upstream-1",
	workflowState: [],
};

const STAGE_IDENTITY = {
	caseId: "audit-log",
	run: "2026-09-06T21-58-29.508Z",
	stage: "shape",
};

async function writeHistoryManifest(
	file: string,
	stage: string,
): Promise<void> {
	await writeRunManifest(file, {
		caseId: "audit-log",
		controlSha: "control-sha",
		judgeModel: "opus",
		model: "sonnet",
		pipeline: {
			stages: [
				{
					kind: "delivery",
					name: stage,
					rubric: `rubrics/${stage}.json`,
					skill: stage,
				},
			],
			statuses: ["To Do", "Done"],
			target: TEST_TARGET,
		},
		pipelinePath: "pipelines/default.json",
		productBrief: "Brief text",
		sessionBudgetUsd: 5,
		sourceRoot: "/src",
		sourceSha: "source-sha",
		task: "Task text",
		taskId: "TASK-1",
		taskSha: "task-sha",
		timestamp: "2026-09-06T21:58:29.508Z",
	});
}

async function writtenStage({
	transcript: mode = "available",
}: { readonly transcript?: StageTranscriptMode } = {}): Promise<StageFixture> {
	const runsDirectory = await historyRunsDirectory("rehearse-stage-reader-");
	const { caseId, run, stage } = STAGE_IDENTITY;
	const paths = benchmarkRunPaths(runsDirectory, run);
	const directory = paths.checkpointDirectory(stage);
	await mkdir(directory, { recursive: true });
	await writeHistoryManifest(paths.manifestFile, stage);

	await writeHistoryCheckpoint({
		declared: { ...STAGE_CHECKPOINT_FIELDS, stage },
		directory,
		mode,
	});

	return { caseId, run, runsDirectory, stage };
}

interface CheckpointCapture {
	readonly directory: string;
	readonly declared: Immutable<Partial<CheckpointRecord>>;
	readonly transcript?: string;
	readonly mode?: StageTranscriptMode;
}

async function writeHistoryCheckpoint({
	directory,
	declared,
	transcript = STAGE_TRANSCRIPT,
	mode = "available",
}: CheckpointCapture): Promise<void> {
	const checkpoint = new CheckpointRecordBuilder({
		effort: undefined,
		...declared,
		transcript: transcriptEvidence(mode),
	}).build();
	await mkdir(directory, { recursive: true });
	await Bun.write(
		join(directory, "checkpoint.json"),
		`${JSON.stringify({ ...declared, ...checkpoint })}\n`,
	);
	if (mode === "available") {
		await Bun.write(join(directory, "transcript.jsonl"), transcript);
	}
}

export {
	writeHistoryCheckpoint,
	writeHistoryManifest,
	STAGE_TRANSCRIPT,
	writtenStage,
};
