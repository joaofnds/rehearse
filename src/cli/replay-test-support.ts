import { parseArgs, recordsDirectory } from "#benchmark/config";
import { writeRunManifest } from "#benchmark/manifest";
import { loadPipeline } from "#benchmark/pipeline";
import { buildRunManifest } from "#benchmark/run";
import { benchmarkRunPaths } from "#benchmark/run-layout";
import {
	AUDIT_LOG_PIPELINE_PATH,
	AUDIT_LOG_RUBRICS_PATH,
} from "#benchmark/test-support";

const sessionArgs = [
	"--model",
	"sonnet",
	"--judge-model",
	"opus",
	"--session-budget-usd",
	"1",
];

/**
 * Replay reads the run's own manifest to find the case it replayed, so a
 * test claiming a run resolved must leave a real manifest at the path replay
 * computes for it, not just a Fake resolveRunDirectory.
 */
export async function writeReplayableRunManifest(
	runName: string,
	runsDirectory: string = recordsDirectory(),
): Promise<string> {
	const paths = benchmarkRunPaths(runsDirectory, runName);
	const config = parseArgs(
		["--target", "/tmp/target", ...sessionArgs],
		{},
		{
			caseId: "audit-log",
			pipelinePath: AUDIT_LOG_PIPELINE_PATH,
			targetPath: "/tmp/target",
		},
	);
	const pipeline = await loadPipeline(
		AUDIT_LOG_PIPELINE_PATH,
		AUDIT_LOG_RUBRICS_PATH,
	);
	const manifest = buildRunManifest({
		timestamp: "2026-09-02T00:00:00.000Z",
		controlSha: "control-sha",
		source: { root: "/tmp/target", sha: "source-sha" },
		taskId: "TASK-1",
		taskSha: "task-sha",
		task: "Task",
		productBrief: "Brief",
		config,
		pipeline,
		spendCeilingUsd: 100,
		corpusVersion: { kind: "version", digest: "0".repeat(64) },
	});

	await writeRunManifest(paths.manifestFile, manifest);

	return paths.manifestFile;
}
