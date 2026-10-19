import { join } from "node:path";

import {
	CaseDeclarationError,
	declaredSettingsFilePath,
	readCaseDeclaration,
} from "./case";
import type { HashedFile } from "./checkpoint";
import { CONTROL_DIR, displayPath } from "./config";
import {
	DEFAULT_STAGE_SETTINGS_FILE,
	StageSettingsError,
	loadStageSettings,
} from "./stage-settings";
import type { LoadedStageSettings } from "./stage-settings";

interface CurrentStageSettingsReference {
	readonly sourcePath: string;
	readonly recordPath: string;
}

interface DeclarationDependencies {
	readonly readCaseDeclaration: typeof readCaseDeclaration;
}

interface CurrentStageSettingsDependencies extends DeclarationDependencies {
	readonly loadStageSettings: typeof loadStageSettings;
}

const declarationDependencies: DeclarationDependencies = {
	readCaseDeclaration,
};

const currentSettingsDependencies: CurrentStageSettingsDependencies = {
	...declarationDependencies,
	loadStageSettings,
};

function referenceFor(sourcePath: string): CurrentStageSettingsReference {
	return { recordPath: displayPath(sourcePath), sourcePath };
}

function defaultReference(): CurrentStageSettingsReference {
	return referenceFor(join(CONTROL_DIR, DEFAULT_STAGE_SETTINGS_FILE));
}

/**
 * The settings declaration a run's case has today. A deleted, renamed, or
 * malformed case and a case that has become a session case fall back to the
 * harness default, matching replay's existing recovery policy.
 */
async function currentStageSettingsReference(
	caseId: string,
	dependencies: DeclarationDependencies = declarationDependencies,
): Promise<CurrentStageSettingsReference> {
	try {
		const declaration = await dependencies.readCaseDeclaration(caseId);
		if (declaration.kind === "pipeline") {
			return referenceFor(declaredSettingsFilePath(declaration));
		}
	} catch (error) {
		if (!(error instanceof CaseDeclarationError)) {
			throw error;
		}
	}

	return defaultReference();
}

async function loadCurrentStageSettings(
	caseId: string,
	dependencies: CurrentStageSettingsDependencies = currentSettingsDependencies,
): Promise<LoadedStageSettings> {
	const reference = await currentStageSettingsReference(caseId, dependencies);

	return await dependencies.loadStageSettings(reference.sourcePath);
}

type CurrentStageSettingsComparison =
	| {
			readonly settingsFile: HashedFile;
			readonly settingsFileRefusal?: never;
	  }
	| {
			readonly settingsFile?: never;
			readonly settingsFileRefusal: string;
	  };

/**
 * Reporting cannot make one unreadable settings file hide every other run.
 * Keep replay's strict loader for paid work, but turn its known settings error
 * into a per-run comparison refusal with only the durable path identity.
 */
async function compareCurrentStageSettings(
	caseId: string,
	dependencies: CurrentStageSettingsDependencies = currentSettingsDependencies,
): Promise<CurrentStageSettingsComparison> {
	const reference = await currentStageSettingsReference(caseId, dependencies);
	try {
		const loaded = await dependencies.loadStageSettings(reference.sourcePath);

		return { settingsFile: loaded.hashed };
	} catch (error) {
		if (!(error instanceof StageSettingsError)) {
			throw error;
		}

		return {
			settingsFileRefusal: `stage settings file ${reference.recordPath} is unavailable: ${error.message.replaceAll(reference.sourcePath, reference.recordPath)}`,
		};
	}
}

export {
	currentStageSettingsReference,
	loadCurrentStageSettings,
	compareCurrentStageSettings,
};
export type { CurrentStageSettingsReference, CurrentStageSettingsComparison };
