import { afterEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import type { CorpusMeasurement } from "./corpus-measurement";
import type { StageDependencies } from "./run";
import { runGradedStages } from "./run";
import {
	StageContextBuilder,
	providerProjectsDirectory,
	testResources,
	unexpectedReports,
} from "./run-stage-context-test-fixture";
import {
	SHA256_HEX_DIGITS,
	fakeStageDependencies,
	stageFixture,
} from "./run-stage-dependencies-test-fixture";
import { expectedCheckpointManifest } from "./run-stage-evidence-test-fixtures";
import { read } from "./run-stage-judge-test-fixtures";
import { projectSlug } from "./session-capture";

const JUDGE_REQUEST_ARGUMENT_INDEX = 1;
const CORPUS_SKILL_ARGUMENT_INDEX = 0;
const WORKFLOW_STAGE_REQUEST_ARGUMENT_INDEX = 0;
const RESOURCE_DRAIN_START_INDEX = 0;
testResources.registerCleanup();
afterEach(() => {
	expect(unexpectedReports.splice(RESOURCE_DRAIN_START_INDEX)).toEqual([]);
});

const expectedSessionsBeforePlanningMeasurement = 0;

const expectedSessionsBeforeBuildMeasurement = 1;

const recordsReadManifest = async (): Promise<void> => {
	const { dependencies, context } = await stageFixture();
	const projectsDirectory = await providerProjectsDirectory();
	const slug = join(projectsDirectory, projectSlug(context.targetDir));
	await mkdir(slug, { recursive: true });
	await Bun.write(
		join(slug, "session.jsonl"),
		`${read(join(context.corpusSource.root, "skills/shape/SKILL.md"))}\n${read(join(context.corpusSource.root, "rulebook/style.md"))}\n`,
	);

	// The real judge grades against the rubric the stage loaded.
	const judgeAgainstLoadedRubric: typeof dependencies.runStageJudge = async (
		...args
	) => ({
		...(await dependencies.runStageJudge(...args)),
		rubric: args[JUDGE_REQUEST_ARGUMENT_INDEX].source.rubric,
	});

	const styleAtStart = {
		path: "rulebook/style.md",
		sha256: "f".repeat(SHA256_HEX_DIGITS),
	};

	const outcome = await runGradedStages(
		{
			...dependencies,
			corpusVersionFiles: async () => await Promise.resolve([styleAtStart]),
			runStageJudge: judgeAgainstLoadedRubric,
		},
		{ ...context, projectsDirectory },
	);

	const [checkpoint] = outcome.checkpoints;

	expect(checkpoint?.readManifest).toEqual(
		await expectedCheckpointManifest(checkpoint, styleAtStart),
	);
};

const measuresBeforeSessions = async (): Promise<void> => {
	const { dependencies, executed } = fakeStageDependencies();
	const sessionsBeforeEachMeasurement: number[] = [];
	const measureCorpus = async (): Promise<CorpusMeasurement> => {
		sessionsBeforeEachMeasurement.push(executed.length);

		return await Promise.resolve<CorpusMeasurement>({
			digest: String(executed.length).repeat(SHA256_HEX_DIGITS),
			kind: "version",
		});
	};

	const outcome = await runGradedStages(
		{ ...dependencies, measureCorpus },
		await new StageContextBuilder().build(),
	);

	expect(sessionsBeforeEachMeasurement).toEqual([
		expectedSessionsBeforePlanningMeasurement,
		expectedSessionsBeforeBuildMeasurement,
	]);
	expect(outcome.checkpoints.map(({ corpusVersion }) => corpusVersion)).toEqual(
		[
			{ digest: "0".repeat(SHA256_HEX_DIGITS), kind: "version" },
			{ digest: "1".repeat(SHA256_HEX_DIGITS), kind: "version" },
		],
	);
};

const recordsRefusedLayout = async (): Promise<void> => {
	const { dependencies, executed } = fakeStageDependencies();
	const refusal: CorpusMeasurement = {
		kind: "refused",
		refusal: "skills/escape.md resolves outside the tree",
	};

	const outcome = await runGradedStages(
		{
			...dependencies,
			measureCorpus: async () => await Promise.resolve(refusal),
		},
		await new StageContextBuilder().build(),
	);

	const [observedFirstCheckpoint] = outcome.checkpoints;

	expect(executed).toEqual(["shape", "build"]);
	expect(observedFirstCheckpoint?.corpusVersion).toEqual(refusal);
};

const hashesAtStageStart = async (): Promise<void> => {
	const { dependencies } = fakeStageDependencies();
	const log: string[] = [];
	const timed = {
		...dependencies,
		captureStageCorpus: async (
			...args: Readonly<Parameters<StageDependencies["captureStageCorpus"]>>
		) => {
			log.push(`corpus:${args[CORPUS_SKILL_ARGUMENT_INDEX]}`);

			return await dependencies.captureStageCorpus(...args);
		},
		resolveSkillDirectory: async (skill: string) => {
			log.push(`resolve:${skill}`);

			return await Promise.resolve(`/skills/${skill}`);
		},
		runWorkflowStage: async (
			...args: Readonly<Parameters<(typeof dependencies)["runWorkflowStage"]>>
		) => {
			log.push(`run:${args[WORKFLOW_STAGE_REQUEST_ARGUMENT_INDEX].stage}`);

			return await dependencies.runWorkflowStage(...args);
		},
	};

	await runGradedStages(timed, await new StageContextBuilder().build());

	expect(log).toEqual([
		"resolve:shape",
		"resolve:build",
		"corpus:shape",
		"run:shape",
		"corpus:build",
		"run:build",
	]);
};
describe("runGradedStages checkpoint corpus", () => {
	it(
		"records in a stage's checkpoint what it declared and loaded, hashed as a later staleness check reads it",
		recordsReadManifest,
	);

	it(
		"records in each stage's checkpoint the corpus version measured before its session ran",
		measuresBeforeSessions,
	);

	it(
		"records a refused corpus layout in the checkpoint and still runs the stage",
		recordsRefusedLayout,
	);

	it(
		"hashes a stage's corpus when the stage starts, not at run start",
		hashesAtStageStart,
	);
});
