import { afterEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { benchmarkRunPaths } from "#benchmark/run-layout";
import {
	DECLARED_PIPELINE,
	OVERRIDE_PIPELINE,
	clearPipelineRoots,
	serving,
} from "#server/pipelines-workspace-test-fixture";

import PipelineDefinitionBuilder from "./pipeline-definition-test-builder";

afterEach(clearPipelineRoots);

describe("GET /api/pipelines", () => {
	describe("when a record cannot be read", () => {
		it(
			"reports a declared pipeline file that does not parse and lists the rest",
			verifyReportsADeclaredPipelineFileThatDoesNotParse,
		);
		it(
			"reports a declared pipeline that does not parse rather than listing what its run recorded",
			verifyReportsADeclaredPipelineThatDoesNotParseRather,
		);
		it(
			"reports a declared pipeline the harness would refuse to run",
			verifyReportsADeclaredPipelineTheHarnessWouldRefuseTo,
		);
		it(
			"reports a case declaration that does not parse, since it may declare a task",
			verifyReportsACaseDeclarationThatDoesNotParseSince,
		);
		it(
			"reports a run manifest that does not parse and lists the rest",
			verifyReportsARunManifestThatDoesNotParseAnd,
		);
	});
});

async function verifyReportsADeclaredPipelineFileThatDoesNotParse(): Promise<void> {
	const { list, cases } = await serving([
		{
			caseId: "pipe-case",
			pipelinePath: OVERRIDE_PIPELINE,
			stages: ["build"],
			timestamp: "2026-09-01T10:00:00.000Z",
		},
	]);
	await Bun.write(join(cases, "pipe-case", "pipeline.json"), "{}");

	const { pipelines, unreadable } = await list();

	expect(pipelines.map(({ path }) => path)).toEqual([OVERRIDE_PIPELINE]);
	expect(unreadable.map(({ id }) => id)).toEqual([DECLARED_PIPELINE]);
}

async function verifyReportsADeclaredPipelineThatDoesNotParseRather(): Promise<void> {
	const { list, cases } = await serving([
		{
			caseId: "pipe-case",
			pipelinePath: DECLARED_PIPELINE,
			stages: ["discuss", "build"],
			timestamp: "2026-09-01T10:00:00.000Z",
		},
	]);
	await Bun.write(join(cases, "pipe-case", "pipeline.json"), "{}");

	const { pipelines, unreadable } = await list();

	expect(pipelines).toEqual([]);
	expect(unreadable.map(({ id }) => id)).toEqual([DECLARED_PIPELINE]);
}

async function verifyReportsADeclaredPipelineTheHarnessWouldRefuseTo(): Promise<void> {
	const { list, cases } = await serving([]);
	await Bun.write(
		join(cases, "pipe-case", "pipeline.json"),
		JSON.stringify(
			new PipelineDefinitionBuilder()
				.withStageNames(["build", "build"])
				.build(),
		),
	);

	const { pipelines, unreadable } = await list();

	expect(pipelines).toEqual([]);
	expect(unreadable.map(({ id }) => id)).toEqual([DECLARED_PIPELINE]);
	const [observedFirstUnreadable] = unreadable;

	expect(observedFirstUnreadable?.reason).toContain("duplicate name");
}

async function verifyReportsACaseDeclarationThatDoesNotParseSince(): Promise<void> {
	const { list, cases } = await serving([]);
	await mkdir(join(cases, "broken-case"));
	await Bun.write(join(cases, "broken-case", "case.json"), "{");

	const { unreadable } = await list();

	expect(unreadable.map(({ id }) => id)).toEqual(["broken-case"]);
}

async function verifyReportsARunManifestThatDoesNotParseAnd(): Promise<void> {
	const { list, names, runsDirectory } = await serving([
		{
			caseId: "pipe-case",
			pipelinePath: OVERRIDE_PIPELINE,
			stages: ["build"],
			timestamp: "2026-09-01T10:00:00.000Z",
		},
	]);
	const [run = ""] = names;
	await Bun.write(benchmarkRunPaths(runsDirectory, run).manifestFile, "{}");

	const { pipelines, unreadable } = await list();

	expect(pipelines.map(({ path }) => path)).toEqual([DECLARED_PIPELINE]);
	expect(unreadable.map(({ id }) => id)).toEqual([run]);
}
