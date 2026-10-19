import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { parseArgs } from "./config";
import { CASE_DEFAULTS, SESSION_ARGS } from "./configuration-test-support";

function selectsAPipelineDefinitionFile(): void {
	const config = parseArgs(
		[
			"--target",
			"./target",
			...SESSION_ARGS,
			"--pipeline",
			"pipelines/three-stage.json",
		],
		{},
		CASE_DEFAULTS,
	);

	expect(config.pipelinePath).toBe("pipelines/three-stage.json");
}

function defaultsThePipelineToTheOneTheCaseDeclares(): void {
	const config = parseArgs(
		["--target", "./target", ...SESSION_ARGS],
		{},
		CASE_DEFAULTS,
	);

	expect(config.pipelinePath).toBe(CASE_DEFAULTS.pipelinePath);
}

function fallsBackToTheTargetTheCaseDeclaresAndLetsTargetOverrideIt(): void {
	const sessionArgs = [...SESSION_ARGS];

	const declared = parseArgs(sessionArgs, {}, CASE_DEFAULTS);
	const overridden = parseArgs(
		["--target", "./target", ...sessionArgs],
		{},
		CASE_DEFAULTS,
	);

	expect(declared.sourceDir).toBe(CASE_DEFAULTS.targetPath);
	expect(overridden.sourceDir).toBe(join(process.cwd(), "target"));
}

function prefersTheEnvironmentTargetOverTheOneTheCaseDeclares(): void {
	const config = parseArgs(
		[...SESSION_ARGS],
		{ BENCHMARK_TARGET_DIR: "/environment/target" },
		CASE_DEFAULTS,
	);

	expect(config.sourceDir).toBe("/environment/target");
}

describe("pipeline run paths", () => {
	it("selects a pipeline definition file", selectsAPipelineDefinitionFile);
	it(
		"defaults the pipeline to the one the case declares",
		defaultsThePipelineToTheOneTheCaseDeclares,
	);
	it(
		"falls back to the target the case declares, and lets --target override it",
		fallsBackToTheTargetTheCaseDeclaresAndLetsTargetOverrideIt,
	);
	it(
		"prefers the environment target over the one the case declares",
		prefersTheEnvironmentTargetOverTheOneTheCaseDeclares,
	);
});
