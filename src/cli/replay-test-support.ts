import { parseArgs, recordsDirectory } from "#benchmark/config";
import { writeRunManifest } from "#benchmark/manifest";
import { loadPipeline } from "#benchmark/pipeline";
import { benchmarkRunPaths } from "#benchmark/run-layout";
import buildRunManifest from "#benchmark/run-manifest";
import {
	AUDIT_LOG_PIPELINE_PATH,
	AUDIT_LOG_RUBRICS_PATH,
} from "#benchmark/test-support";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";

const sessionArgs = [
	"--model",
	"sonnet",
	"--effort",
	"medium",
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
async function writeReplayableRunManifest(
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
		config,
		controlSha: "control-sha",
		corpusVersion: { digest: "0".repeat(SHA256_HEX_DIGITS), kind: "version" },
		pipeline,
		productBrief: "Brief",
		source: {
			root: "/tmp/checkout",
			sha: "source-sha",
			targetRoot: "/tmp/target",
		},
		spendCeilingUsd: 100,
		task: "Task",
		taskId: "TASK-1",
		taskSha: "task-sha",
		timestamp: "2026-09-02T00:00:00.000Z",
	});

	await writeRunManifest(paths.manifestFile, manifest);

	return paths.manifestFile;
}

export { writeReplayableRunManifest as default };
