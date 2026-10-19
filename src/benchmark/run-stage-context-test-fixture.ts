import { expect } from "bun:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { StageContext } from "./run";
import { createRunAbort, fileRunArtifactPersistence } from "./run-abort";
import { loadDefaultPipeline } from "./run-pipeline-test-fixtures";
import { projectSlug } from "./session-capture";
import {
	TestResources,
	ampleSpendCeiling,
	fakeRunAbortSignals,
} from "./test-support";

const SHA256_HEX_DIGITS = 64;

const testResources = new TestResources();

const unexpectedReports: string[] = [];

const defaultStageSettings = {
	hashed: {
		path: "stage-settings.json",
		sha256: "a".repeat(SHA256_HEX_DIGITS),
	},
	json: "{}",
};

const unavailableProductOwner = {
	ask: async () =>
		await Promise.reject(new Error("no product owner in this test")),
	snapshot: () => ({
		providerCalls: [],
		sessionId: "po",
		spentUsd: 0,
	}),
} satisfies StageContext["productOwner"];

async function unexpectedCalibration(): Promise<never> {
	return await Promise.reject(new Error("calibration not expected"));
}

class StageContextBuilder {
	readonly #overrides: Partial<StageContext>;
	public constructor(overrides: Partial<StageContext> = {}) {
		this.#overrides = overrides;
	}
	public async build(): Promise<StageContext> {
		const stageDirectory = await mkdtemp(join(tmpdir(), "rehearse-stages-"));

		testResources.track(stageDirectory);

		const transitions = fileStageTransitions(stageDirectory);

		return {
			baselineContext: [],
			baselineHashes: new Map<string, string>(),
			calibrateStageFailure: unexpectedCalibration,
			checkpointDirectory: (stage: string) =>
				join(stageDirectory, "checkpoints", stage),
			collectJudgeAgreement: async () =>
				await Promise.resolve({
					baselines: [],
					skippedCalibrations: 0,
				}),
			completeStage: transitions.completeStage,
			corpusSource: { kind: "directory", root: stageDirectory },
			initialLineage: "initial-lineage",
			instructions: "Instructions",
			judgeModel: "sonnet",
			loadedSettings: defaultStageSettings,
			model: "sonnet",
			pipeline: await loadDefaultPipeline(),
			productBrief: "Brief",
			productOwner: unavailableProductOwner,
			reportError: (message: string) => {
				unexpectedReports.push(message);
			},
			sessionBudgetUsd: 5,
			spendCeiling: ampleSpendCeiling(),
			stageFile: (stage: string) => join(stageDirectory, `${stage}.json`),
			stopAtCeiling: transitions.stopAtCeiling,
			stoppedSessionDirectory: (stage: string) =>
				join(stageDirectory, "stopped", stage),
			targetDir: stageDirectory,
			task: "Task",
			taskId: "TASK-1",
			taskSha: "task-sha",
			updatePendingStage: transitions.updatePendingStage,
			writePendingStage: transitions.writePendingStage,
			writeStageProgress: transitions.writeStageProgress,
			...this.#overrides,
		};
	}
}

function fileStageTransitions(
	stageDirectory: string,
): ReturnType<typeof createRunAbort> {
	return createRunAbort(
		{
			killActiveCommands: async () => {
				await Promise.resolve();
			},
			...fakeRunAbortSignals(),
			persistence: fileRunArtifactPersistence,
			reportError: (message) => {
				expect.unreachable(message);
			},
		},
		{
			artifactFile: join(stageDirectory, "run.json"),
			operatorStopFile: join(stageDirectory, "operator-stop.json"),
			teardown: async () => {
				await Promise.resolve();
			},
		},
	);
}

async function providerProjectsDirectory(): Promise<string> {
	const projectsDirectory = await mkdtemp(join(tmpdir(), "rehearse-projects-"));
	testResources.track(projectsDirectory);

	return projectsDirectory;
}
async function seedStageTranscript(
	context: Readonly<StageContext>,
	raw: string,
): Promise<{ readonly projectsDirectory: string; readonly slug: string }> {
	const projectsDirectory = await providerProjectsDirectory();
	const slug = join(projectsDirectory, projectSlug(context.targetDir));
	await mkdir(slug, { recursive: true });
	await Bun.write(join(slug, "session.jsonl"), raw);

	return { projectsDirectory, slug };
}
async function noCalibration(): Promise<undefined> {
	await Promise.try((): undefined => undefined);
	return undefined;
}

async function seedRunBacklog(context: Readonly<StageContext>): Promise<void> {
	await mkdir(join(context.targetDir, "backlog"), { recursive: true });
	await Bun.write(
		join(context.targetDir, "backlog", "config.yml"),
		"statuses: []\n",
	);
}
async function blockTranscriptDestination(
	projectsDirectory: string,
): Promise<string> {
	const blocked = join(projectsDirectory, "blocked-file");
	await Bun.write(blocked, "");

	return blocked;
}
export {
	blockTranscriptDestination,
	seedRunBacklog,
	providerProjectsDirectory,
	seedStageTranscript,
	noCalibration,
	StageContextBuilder,
	testResources,
	unexpectedReports,
};
