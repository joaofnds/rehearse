import { describe, expect, it } from "bun:test";
import { join, resolve } from "node:path";

import {
	CaseDeclarationError,
	casesRoot,
	loadCase,
	parseCaseDeclaration,
	requirePipelineCase,
} from "#benchmark/case";
import { runCommand } from "#benchmark/command";
import { CONTROL_DIR, DEFAULT_CASE_ID } from "#benchmark/config";
import { pipelineDefinitionSchema } from "#benchmark/pipeline";
import { DEFAULT_STAGE_SETTINGS_FILE } from "#benchmark/stage-settings";
import { PROJECT_ROOT, TestResources } from "#benchmark/test-support";

import {
	CaseDeclarationBuilder,
	pipelineWithoutTask,
} from "./case-test-fixtures";

const resources = TestResources.forEachTest();

const COMMIT_BEFORE_THE_MOVE = "ccfdeb017667a0a1db9027a5e014b7e5650b7935";

async function bytesBeforeTheMove(path: string): Promise<string> {
	return await runCommand(
		["git", "show", `${COMMIT_BEFORE_THE_MOVE}:${path}`],
		PROJECT_ROOT,
	);
}

async function resolvesTheSameCaseWhetherTheIdIsDefaultOrNamed(): Promise<void> {
	const [byDefault, byName] = await Promise.all([
		loadCase(DEFAULT_CASE_ID),
		loadCase("audit-log"),
	]);

	expect(byDefault).toEqual(byName);
}

function refusesACaseWithNoDeclarationOnDiskNamingIt(): void {
	expect(loadCase("missing")).rejects.toThrow("Unknown case missing");
}

async function resolvesARelativeDeclaredTargetAgainstTheCaseDirectory(): Promise<void> {
	const benchmarkCase = requirePipelineCase(await loadCase("audit-log"));

	expect(benchmarkCase.targetPath).toBe(
		resolve(
			CONTROL_DIR,
			"cases/audit-log",
			benchmarkCase.declaration.target.path,
		),
	);
}

async function returnsTheAuditLogTaskBriefAndFinalRubricByteForByte(): Promise<void> {
	const benchmarkCase = requirePipelineCase(await loadCase("audit-log"));

	expect(benchmarkCase.task).toBe(await bytesBeforeTheMove("backlog-seed.md"));
	expect(benchmarkCase.productBrief).toBe(
		await bytesBeforeTheMove("product-brief.md"),
	);
	expect(benchmarkCase.finalRubric).toBe(await bytesBeforeTheMove("rubric.md"));
}

async function returnsTheAuditLogStageRubricsByteForByte(): Promise<void> {
	const benchmarkCase = requirePipelineCase(await loadCase("audit-log"));

	expect(benchmarkCase.stageRubrics["shape"]?.content).toBe(
		await bytesBeforeTheMove("rubrics/shape.json"),
	);
	expect(benchmarkCase.stageRubrics["build"]?.content).toBe(
		await bytesBeforeTheMove("rubrics/build.json"),
	);
}

async function returnsTheAuditLogPipelineDefinitionAsItWasBeforeTheMoveWithItsRubricsRehomed(): Promise<void> {
	const benchmarkCase = requirePipelineCase(await loadCase("audit-log"));

	const before = await bytesBeforeTheMove("pipelines/default.json");
	const rehomed = pipelineDefinitionSchema.parse(
		JSON.parse(before.replaceAll('"rubrics/', '"cases/audit-log/rubrics/')),
	);
	const {
		setup: _setup,
		services: _services,
		...target
	} = benchmarkCase.pipeline.target;

	expect({ ...benchmarkCase.pipeline, target }).toEqual(rehomed);
}

async function resolvesTheHarnessOwnedDefaultSettingsFileWhenTheCaseDeclaresNone(): Promise<void> {
	const benchmarkCase = requirePipelineCase(await loadCase("audit-log"));

	expect(benchmarkCase.settingsFilePath).toBe(
		join(CONTROL_DIR, DEFAULT_STAGE_SETTINGS_FILE),
	);
}

function carriesADeclaredSettingsFileOnThePipelineDeclaration(): void {
	const id = "audit-log";
	const declared = parseCaseDeclaration(
		id,
		new CaseDeclarationBuilder({
			settingsFile: "settings.json",
		}).pipelineJson(),
	);

	expect(declared).toMatchObject({ settingsFile: "settings.json" });
}

async function namesTheMissingFileAndTheFixWhenADeclaredFileIsAbsent(): Promise<void> {
	const id = "zz-missing-task-probe";
	const directory = join(casesRoot(), id);
	resources.track(directory);

	await Promise.all(
		pipelineWithoutTask(id).map(async ([path, contents]) => {
			await Bun.write(join(directory, path), contents);
		}),
	);

	const failure = loadCase(id);

	expect(failure).rejects.toBeInstanceOf(CaseDeclarationError);
	expect(failure).rejects.toThrow(
		`Case ${id} declares task at backlog-seed.md, but no file is there; add it or correct the declaration`,
	);
}

describe(loadCase.name, () => {
	it(
		"resolves the same case whether the id is default or named",
		resolvesTheSameCaseWhetherTheIdIsDefaultOrNamed,
	);
	it(
		"refuses a case with no declaration on disk, naming it",
		refusesACaseWithNoDeclarationOnDiskNamingIt,
	);
	it(
		"resolves a relative declared target against the case directory",
		resolvesARelativeDeclaredTargetAgainstTheCaseDirectory,
	);
	it(
		"returns the audit-log task, brief, and final rubric byte for byte",
		returnsTheAuditLogTaskBriefAndFinalRubricByteForByte,
	);
	it(
		"returns the audit-log stage rubrics byte for byte",
		returnsTheAuditLogStageRubricsByteForByte,
	);
	it(
		"returns the audit-log pipeline definition as it was before the move, with its rubrics rehomed",
		returnsTheAuditLogPipelineDefinitionAsItWasBeforeTheMoveWithItsRubricsRehomed,
	);
	it(
		"resolves the harness-owned default settings file when the case declares none",
		resolvesTheHarnessOwnedDefaultSettingsFileWhenTheCaseDeclaresNone,
	);
	it(
		"carries a declared settingsFile on the pipeline declaration",
		carriesADeclaredSettingsFileOnThePipelineDeclaration,
	);
	it(
		"names the missing file and the fix when a declared file is absent",
		namesTheMissingFileAndTheFixWhenADeclaredFileIsAbsent,
	);
});
