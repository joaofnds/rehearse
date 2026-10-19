import { describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { CaseDeclarationError } from "./case";
import type { CaseDeclaration } from "./case";
import { CONTROL_DIR } from "./config";
import {
	compareCurrentStageSettings,
	currentStageSettingsReference,
	loadCurrentStageSettings,
} from "./current-stage-settings";
import { StageSettingsError, loadStageSettings } from "./stage-settings";
import type { LoadedStageSettings } from "./stage-settings";
import { TestResources } from "./test-support";

const SHA256_HEX_DIGITS = 64;

const testResources = TestResources.forEachTest();

const pipelineCase: CaseDeclaration = {
	finalRubric: "rubric.md",
	id: "audit-log",
	kind: "pipeline",
	pipeline: "pipeline.json",
	productBrief: "brief.md",
	rubrics: "rubrics",
	settingsFile: "settings/stage.json",
	target: { path: "/target" },
	task: "task.md",
	title: "Audit log",
};

const currentStageSettingsReferenceSelectsThePipelineCasesDeclaredSettingsFile =
	async (): Promise<void> => {
		const reference = await currentStageSettingsReference("audit-log", {
			readCaseDeclaration: async () => await Promise.resolve(pipelineCase),
		});

		expect(reference).toEqual({
			recordPath: "cases/audit-log/settings/stage.json",
			sourcePath: join(
				CONTROL_DIR,
				"cases",
				"audit-log",
				"settings/stage.json",
			),
		});
	};

const currentStageSettingsReferenceFallsBackToTheRootDefaultWhenTheCaseNoLongerLoads =
	async (): Promise<void> => {
		const reference = await currentStageSettingsReference("removed", {
			readCaseDeclaration: async () =>
				await Promise.reject(
					new CaseDeclarationError("case declaration unavailable"),
				),
		});

		expect(reference).toEqual({
			recordPath: "stage-settings.json",
			sourcePath: join(CONTROL_DIR, "stage-settings.json"),
		});
	};

describe(currentStageSettingsReference.name, () => {
	it(
		"selects the pipeline case's declared settings file",
		currentStageSettingsReferenceSelectsThePipelineCasesDeclaredSettingsFile,
	);

	it(
		"falls back to the root default when the case no longer loads",
		currentStageSettingsReferenceFallsBackToTheRootDefaultWhenTheCaseNoLongerLoads,
	);
});

const loadCurrentStageSettingsLoadsTheSelectedFileOnce =
	async (): Promise<void> => {
		const loaded: LoadedStageSettings = {
			hashed: {
				path: "stage-settings.json",
				sha256: "a".repeat(SHA256_HEX_DIGITS),
			},
			json: "{}",
		};
		const paths: string[] = [];

		const result = await loadCurrentStageSettings("audit-log", {
			loadStageSettings: async (path) => {
				paths.push(path);

				return await Promise.resolve(loaded);
			},
			readCaseDeclaration: async () => await Promise.resolve(pipelineCase),
		});

		expect(result).toBe(loaded);
		expect(paths).toEqual([
			join(CONTROL_DIR, "cases", "audit-log", "settings/stage.json"),
		]);
	};

const loadCurrentStageSettingsRetainsASuccessfullyLoadedCasedeclaredSettingsIdentity =
	async (): Promise<void> => {
		const caseId = "zz-current-stage-settings";
		const caseDirectory = join(CONTROL_DIR, "cases", caseId);
		const settingsPath = join(caseDirectory, "settings", "stage.json");
		testResources.track(caseDirectory);
		await mkdir(join(caseDirectory, "settings"), { recursive: true });
		await Bun.write(settingsPath, '{"disableAllHooks":true}');

		const loaded = await loadCurrentStageSettings(caseId, {
			loadStageSettings,
			readCaseDeclaration: async () =>
				await Promise.resolve({
					...pipelineCase,
					id: caseId,
				}),
		});

		expect(loaded.hashed.path).toBe(`cases/${caseId}/settings/stage.json`);
	};

describe(loadCurrentStageSettings.name, () => {
	it(
		"loads the selected file once",
		loadCurrentStageSettingsLoadsTheSelectedFileOnce,
	);

	it(
		"retains a successfully loaded case-declared settings identity",
		loadCurrentStageSettingsRetainsASuccessfullyLoadedCasedeclaredSettingsIdentity,
	);
});

const compareCurrentStageSettingsTurnsAnUnavailableSelectedFileIntoARedactedRefusal =
	async (): Promise<void> => {
		const result = await compareCurrentStageSettings("audit-log", {
			loadStageSettings: async (path) =>
				await Promise.reject(
					new StageSettingsError(`No stage settings file at ${path}`),
				),
			readCaseDeclaration: async () => await Promise.resolve(pipelineCase),
		});

		expect(result).toEqual({
			settingsFileRefusal:
				"stage settings file cases/audit-log/settings/stage.json is unavailable: No stage settings file at cases/audit-log/settings/stage.json",
		});
	};

describe(compareCurrentStageSettings.name, () => {
	it(
		"turns an unavailable selected file into a redacted refusal",
		compareCurrentStageSettingsTurnsAnUnavailableSelectedFileIntoARedactedRefusal,
	);
});
