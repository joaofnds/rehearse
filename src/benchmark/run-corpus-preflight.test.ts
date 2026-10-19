import { afterEach, describe, expect, it } from "bun:test";
import { symlink } from "node:fs/promises";
import { join } from "node:path";

import { failureOf } from "#cli/cli-test-support";

import { captureStageCorpus, resolveSkillDirectory } from "./checkpoint";
import { SymlinkedEntryError } from "./file-presence";
import { runGradedStages } from "./run";
import {
	StageContextBuilder,
	testResources,
	unexpectedReports,
} from "./run-stage-context-test-fixture";
import {
	fakeStageDependencies,
	stageFixture,
} from "./run-stage-dependencies-test-fixture";

const RESOURCE_DRAIN_START_INDEX = 0;
testResources.registerCleanup();
afterEach(() => {
	expect(unexpectedReports.splice(RESOURCE_DRAIN_START_INDEX)).toEqual([]);
});

const rejectsMissingCorpus = async (): Promise<void> => {
	const { dependencies, executed } = fakeStageDependencies();
	const missing = {
		...dependencies,
		resolveSkillDirectory: async (skill: string) => {
			if (skill === "build") {
				return await Promise.reject(
					new Error(`The ${skill} skill is not installed`),
				);
			}

			return await Promise.resolve(`/skills/${skill}`);
		},
	};

	expect(
		runGradedStages(missing, await new StageContextBuilder().build()),
	).rejects.toThrow("build skill is not installed");
	expect(executed).toEqual([]);
};

const rejectsMissingSkill = async (): Promise<void> => {
	const { dependencies, executed } = fakeStageDependencies();
	const missing = {
		...dependencies,
		resolveSkillDirectory: async (skill: string) => {
			if (skill === "build") {
				return await Promise.reject(
					new Error(`The ${skill} skill is not installed`),
				);
			}

			return await Promise.resolve(`/skills/${skill}`);
		},
	};

	expect(
		runGradedStages(missing, await new StageContextBuilder().build()),
	).rejects.toThrow("build skill is not installed");
	expect(executed).toEqual([]);
};

const rejectsForeignLayout = async (): Promise<void> => {
	const { dependencies, executed, context } = await stageFixture();
	const root = join(context.targetDir, "corpus");
	await Bun.write(join(root, "skills", "shape", "SKILL.md"), "shape\n");
	await Bun.write(join(root, "skills", "build", "SKILL.md"), "build\n");
	const outside = join(context.targetDir, "foreign");
	await Bun.write(join(outside, "private.md"), "foreign bytes\n");
	await symlink(outside, join(root, "agents"));

	const failure = await failureOf(
		runGradedStages(
			{ ...dependencies, captureStageCorpus, resolveSkillDirectory },
			{ ...context, corpusSource: { kind: "directory", root } },
		),
	);

	expect(failure).toBeInstanceOf(SymlinkedEntryError);
	expect(executed).toEqual([]);
};
describe("runGradedStages corpus preflight", () => {
	it(
		"fails before any stage runs when a skill's corpus is missing",
		rejectsMissingCorpus,
	);

	it(
		"fails before any stage runs when a stage's skill is missing",
		rejectsMissingSkill,
	);

	it(
		"refuses a foreign layout before invoking the affected workflow",
		rejectsForeignLayout,
	);
});
