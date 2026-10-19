import { mkdir } from "node:fs/promises";

import { confirmationGroupRecordSchema } from "#benchmark/confirmation-record";
import { writeRunManifest } from "#benchmark/manifest";
import type { RunManifest } from "#benchmark/manifest";
import {
	benchmarkRunPaths,
	confirmationGroupPaths,
	runNameFromTimestamp,
} from "#benchmark/run-layout";
import {
	GIT_SHA1_HEX_DIGITS,
	SHA256_HEX_DIGITS,
} from "#server/digest-test-support";

import PipelineDefinitionBuilder from "./pipeline-definition-test-builder";

const PER_REP_MAXIMUM_USD = 5;

const ORDINAL_BASE = 1;

async function recordGroup(
	runsDirectory: string,
	group: RecordedGroup,
): Promise<void> {
	const paths = confirmationGroupPaths(runsDirectory, group.groupId);
	const ordinals = Array.from(
		{ length: group.reps },
		(_slot, index) => index + ORDINAL_BASE,
	);
	const record = groupRecord(group, ordinals);
	await mkdir(paths.directory, { recursive: true });
	await Bun.write(paths.groupFile, JSON.stringify(record));
}

interface RecordedRun {
	readonly timestamp: string;
	readonly caseId: string;
	readonly pipelinePath: string;
	readonly stages: readonly string[];
	readonly corpusDigest?: string;
}

interface RecordedGroup {
	readonly groupId: string;
	readonly caseId: string;
	readonly pipelinePath: string;
	readonly stages: readonly string[];
	readonly reps: number;
	readonly corpusDigest?: string;
	readonly startedAt?: string;
}

async function recordRun(
	runsDirectory: string,
	run: RecordedRun,
): Promise<string> {
	const name = runNameFromTimestamp(run.timestamp);
	const { checkpointsDirectory, manifestFile } = benchmarkRunPaths(
		runsDirectory,
		name,
	);
	await mkdir(checkpointsDirectory, { recursive: true });
	const manifest: RunManifest = {
		caseId: run.caseId,
		controlSha: "1".repeat(GIT_SHA1_HEX_DIGITS),
		judgeModel: "opus",
		model: "sonnet",
		pipeline: new PipelineDefinitionBuilder()
			.withStageNames(run.stages)
			.build(),
		pipelinePath: run.pipelinePath,
		productBrief: "the brief",
		sessionBudgetUsd: 5,
		sourceRoot: "/target",
		sourceSha: "2".repeat(GIT_SHA1_HEX_DIGITS),
		task: "the task",
		taskId: "ACT-1",
		taskSha: "3".repeat(GIT_SHA1_HEX_DIGITS),
		timestamp: run.timestamp,
	};
	await writeRunManifest(
		manifestFile,
		run.corpusDigest === undefined
			? manifest
			: {
					...manifest,
					corpusVersion: { digest: run.corpusDigest, kind: "version" },
				},
	);

	return name;
}

function groupRecord(
	group: RecordedGroup,
	ordinals: readonly number[],
): ReturnType<typeof confirmationGroupRecordSchema.parse> {
	return confirmationGroupRecordSchema.parse({
		approval: { approved: true, method: "yes" },
		caseId: group.caseId,
		declaredStages: group.stages,
		groupId: group.groupId,
		inputs: {
			corpusVersion:
				group.corpusDigest === undefined
					? undefined
					: { digest: group.corpusDigest, kind: "version" },
			files: [
				{
					kind: "corpus",
					path: "inputs/corpus/SKILL.md",
					sha256: "c".repeat(SHA256_HEX_DIGITS),
				},
			],
			judgeModel: "opus",
			lineage: { kind: "SOURCE", sha: "2".repeat(GIT_SHA1_HEX_DIGITS) },
			model: "sonnet",
			pipelinePath: group.pipelinePath,
			sessionBudgetUsd: 5,
		},
		makespanMs: 200,
		mode: "pipeline",
		projectedCost: {
			perRepMaximumUsd: 5,
			reps: group.reps,
			totalMaximumUsd: PER_REP_MAXIMUM_USD * group.reps,
		},
		repRecords: ordinals.map((ordinal) => ({
			ordinal,
			path: `reps/${group.groupId}-rep-${ordinal}/rep.json`,
			repId: `${group.groupId}-rep-${ordinal}`,
		})),
		reportFile: "report.json",
		reps: group.reps,
		schemaVersion: 1,
		startedAt: group.startedAt,
	});
}

export { recordGroup, recordRun };

export type { RecordedRun, RecordedGroup };
