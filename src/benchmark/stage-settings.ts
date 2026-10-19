import { z } from "zod";

import type { HashedFile } from "./checkpoint";
import { displayPath } from "./config";
import parseJsonDocument from "./json-document";
import orderedJson from "./ordered-json";
import orderedValidationIssues from "./validation-issue-order";

const stageSettingsFields: readonly string[] = [
	"permissions",
	"disableAllHooks",
	"disableSkillShellExecution",
	"disableBundledSkills",
	"disableWorkflows",
	"disableAutoMode",
];

class StageSettingsError extends Error {
	public override name = "StageSettingsError";
}

/**
 * Where the harness-owned settings file lives when a case declares none of
 * its own, relative to the control repository root: committed, versioned
 * data the harness ships, the same way `CLAUDE.md` at the root is corpus the
 * harness ships. A case names its own file to override this one; neither is
 * ever a copy of the operator's live `~/.claude/settings.json`.
 */
const DEFAULT_STAGE_SETTINGS_FILE = "stage-settings.json";

const stagePermissionsSchema = z
	.object({ deny: z.array(z.string()) })
	.strict()
	.optional();

/**
 * Every key a stage session's settings file may carry: the permissions deny
 * list and the boolean feature switches the harness has an opinion on. No
 * `hooks` key exists here, and `.strict()` refuses any key this schema does
 * not name, so a hooks block, a live settings.json's other knobs, or a typo
 * all fail to parse rather than reaching a stage session unnoticed.
 */
const stageSettingsSchema = z
	.object({
		disableAllHooks: z.boolean().optional(),
		disableAutoMode: z.boolean().optional(),
		disableBundledSkills: z.boolean().optional(),
		disableSkillShellExecution: z.boolean().optional(),
		disableWorkflows: z.boolean().optional(),
		permissions: stagePermissionsSchema,
	})
	.strict();

type StageSettings = z.infer<typeof stageSettingsSchema>;

interface LoadedStageSettings {
	readonly json: string;
	readonly hashed: HashedFile;
}

async function readSettingsBytes(path: string): Promise<Uint8Array> {
	try {
		const file = Bun.file(path);
		if (!(await file.exists())) {
			throw new StageSettingsError(
				`No stage settings file at ${path}; add it or correct the declared settingsFile`,
			);
		}
		return await file.bytes();
	} catch (error) {
		if (error instanceof StageSettingsError) {
			throw error;
		}
		throw new StageSettingsError(
			`Cannot read stage settings file ${path}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

function parseStageSettings(contents: string, path: string): StageSettings {
	const documentReading = parseJsonDocument(contents, stageSettingsSchema);
	if (documentReading.kind === "invalid-json") {
		const { error } = documentReading;
		throw new StageSettingsError(
			`Stage settings file ${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	const { parsed } = documentReading;
	if (!parsed.success) {
		const [issue] = orderedValidationIssues({
			error: parsed.error,
			order: { fields: stageSettingsFields },
		});
		const field = issue?.path.join(".");
		throw new StageSettingsError(
			`Stage settings file ${path} has an invalid ${field === undefined || field === "" ? "declaration" : field}: ${issue?.message ?? "invalid settings"}`,
		);
	}

	return parsed.data;
}

/**
 * Lineage hashes the same re-serialized JSON that reaches `--settings`, not
 * the file's raw bytes, so a settings file with insignificant whitespace
 * still produces one canonical lineage hash.
 */
async function loadStageSettings(path: string): Promise<LoadedStageSettings> {
	const bytes = await readSettingsBytes(path);

	const settings = parseStageSettings(new TextDecoder().decode(bytes), path);

	const settingsJson = JSON.stringify(settings);
	const json = orderedJson({
		json: settingsJson,
		order: { fields: stageSettingsFields },
		space: 0,
	});

	return {
		hashed: {
			path: displayPath(path),
			sha256: new Bun.CryptoHasher("sha256").update(json).digest("hex"),
		},
		json,
	};
}

export {
	StageSettingsError,
	DEFAULT_STAGE_SETTINGS_FILE,
	stageSettingsSchema,
	stageSettingsFields,
	loadStageSettings,
};
export type { StageSettings, LoadedStageSettings };
