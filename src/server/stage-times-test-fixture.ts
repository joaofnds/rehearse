import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeRunManifest } from "#benchmark/manifest";
import { benchmarkRunPaths } from "#benchmark/run-layout";
import { directorySource } from "#benchmark/run-records-test-support";
import { TEST_TARGET } from "#benchmark/test-support";
import ApiTestHarness from "#server/api-test-harness";

const systems: ApiTestHarness[] = [];

async function startEvidenceApi(
	directory: string,
): Promise<ApiTestHarness["driver"]> {
	const system = await ApiTestHarness.setup({
		runsDirectory: directory,
		source: directorySource(directory),
	});
	systems.push(system);

	return system.driver;
}

const RESOURCE_DRAIN_START_INDEX = 0;

const CASE = "audit-log";

const STAGES = ["discuss", "build", "review"] as const;

const roots: string[] = [];

async function runsDirectory(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-stage-times-"));
	roots.push(root);

	return root;
}

/** A pipeline run of a case, with the elapsed time each listed stage recorded. */
async function recordRun(
	directory: string,
	props: {
		readonly run: string;
		readonly caseId?: string;
		readonly stageMs?: Readonly<Partial<Record<string, number>>>;
		readonly stoppedIn?: string;
	},
): Promise<void> {
	const paths = benchmarkRunPaths(directory, props.run);
	await writeRunManifest(paths.manifestFile, {
		caseId: props.caseId ?? CASE,
		controlSha: "control-sha",
		judgeModel: "opus",
		model: "sonnet",
		pipeline: {
			stages: STAGES.map((name) => ({
				kind: "delivery",
				name,
				rubric: `rubrics/${name}.json`,
				skill: name,
			})),
			statuses: ["To Do", "Done"],
			target: TEST_TARGET,
		},
		pipelinePath: "pipelines/default.json",
		productBrief: "Brief text",
		sessionBudgetUsd: 5,
		sourceRoot: join(directory, "source"),
		sourceSha: "source-sha",
		task: "Task text",
		taskId: "TASK-1",
		taskSha: "task-sha",
		timestamp: props.run,
	});
	await Array.fromAsync(
		Object.entries(props.stageMs ?? {}),
		async ([stage, elapsedMs]) => {
			await Bun.write(
				paths.stageFile(stage),
				JSON.stringify(
					stage === props.stoppedIn
						? { elapsedMs, status: "STAGE_JUDGE_FAILED" }
						: { elapsedMs },
				),
			);
		},
	);
}

async function clearStageTimeRoots(): Promise<void> {
	await Promise.all(
		systems.splice(RESOURCE_DRAIN_START_INDEX).map(async (system) => {
			await system.teardown();
		}),
	);
	await Promise.all(
		roots.splice(RESOURCE_DRAIN_START_INDEX).map(async (root) => {
			await rm(root, { force: true, recursive: true });
		}),
	);
}

export {
	STAGES,
	runsDirectory,
	recordRun,
	startEvidenceApi,
	clearStageTimeRoots,
};
