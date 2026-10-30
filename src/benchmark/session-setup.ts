import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import type { Immutable } from "./contracts";
import { pathExists } from "./file-presence";
import { jsonArraySchema, jsonObjectSchema } from "./json-value";
import type { JsonObject, JsonValue } from "./json-value";
import type {
	actualSetupRecordSchema,
	sessionSetupRecordSchema,
} from "./session-record-context-schema";

/**
 * The files that carry the user's own Claude Code setup into a session: their
 * settings with the harness's declared keys merged over them, their MCP
 * configuration, and the plugin directories setting sources alone do not load.
 */
interface ActualSetupFiles {
	readonly kind: "actual";
	readonly settingsFile: string;
	readonly mcpConfigFiles: readonly string[];
	readonly pluginDirectories: readonly string[];
}

type SessionSetup = { readonly kind: "isolated" } | ActualSetupFiles;

type ActualSetupRecord = Immutable<z.infer<typeof actualSetupRecordSchema>>;

type SessionSetupRecord = Immutable<z.infer<typeof sessionSetupRecordSchema>>;

interface ActualSetup {
	readonly files: ActualSetupFiles;
	readonly record: ActualSetupRecord;
}

interface PreparedSetup {
	readonly files: SessionSetup;
	readonly record: SessionSetupRecord;
}

const ISOLATED_SETUP: PreparedSetup = {
	files: { kind: "isolated" },
	record: { kind: "isolated" },
};

interface ActualSetupSource {
	readonly home: string;
	readonly directory: string;
	readonly declared: Immutable<JsonObject>;
}

const RUN_DECIDED_KEYS = new Set(["model", "effortLevel"]);

const RUN_DECIDED_VARIABLES = new Set(["CLAUDE_CODE_EFFORT_LEVEL"]);

const pluginManifestSchema = z.object({ name: z.string().nonempty() });

function sha256(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}

function objectAt(
	value: Immutable<JsonValue> | undefined,
): Immutable<JsonObject> {
	const parsed = jsonObjectSchema.safeParse(value);

	return parsed.success ? parsed.data : {};
}

function unionedRules(
	user: Immutable<JsonValue> | undefined,
	declared: Immutable<JsonValue>,
): Immutable<JsonValue> {
	const userRules = jsonArraySchema.safeParse(user);
	const declaredRules = jsonArraySchema.safeParse(declared);
	if (!userRules.success || !declaredRules.success) {
		return declared;
	}

	return [...new Set([...userRules.data, ...declaredRules.data])];
}

function unionedPermissions(
	user: Immutable<JsonValue> | undefined,
	declared: Immutable<JsonValue> | undefined,
): Immutable<JsonObject> {
	const userPermissions = objectAt(user);

	return {
		...userPermissions,
		...Object.fromEntries(
			Object.entries(objectAt(declared)).map(([key, rules]) => [
				key,
				unionedRules(userPermissions[key], rules),
			]),
		),
	};
}

function withoutRunDecidedKeys(
	settings: Immutable<JsonObject>,
): Immutable<JsonObject> {
	const kept = Object.fromEntries(
		Object.entries(settings).filter(([key]) => !RUN_DECIDED_KEYS.has(key)),
	);
	if (settings["env"] === undefined) {
		return kept;
	}

	return {
		...kept,
		env: Object.fromEntries(
			Object.entries(objectAt(settings["env"])).filter(
				([name]) => !RUN_DECIDED_VARIABLES.has(name),
			),
		),
	};
}

/**
 * The declared keys replace the user's, except that permission rules are
 * unioned so the user's deny rules survive a case's grants. The user's model
 * and effort are dropped, the effort variable in their env included, since
 * the run passes its own on the command line.
 */
function mergedSettings(
	user: Immutable<JsonObject>,
	declared: Immutable<JsonObject>,
): Immutable<JsonObject> {
	const merged = { ...withoutRunDecidedKeys(user), ...declared };
	if (
		user["permissions"] === undefined ||
		declared["permissions"] === undefined
	) {
		return merged;
	}

	return {
		...merged,
		permissions: unionedPermissions(
			user["permissions"],
			declared["permissions"],
		),
	};
}

/**
 * The error names the file and never quotes it, since its text can hold a
 * credential and an error message reaches the terminal and the record.
 */
async function readJsonObject(path: string): Promise<JsonObject> {
	if (!(await pathExists(path))) {
		return {};
	}

	let parsed: unknown = undefined;
	try {
		parsed = JSON.parse(await readFile(path, "utf8"));
	} catch {
		throw new Error(`${path} is not valid JSON`);
	}

	const object = jsonObjectSchema.safeParse(parsed);
	if (!object.success) {
		throw new Error(`${path} does not hold a JSON object`);
	}

	return object.data;
}

async function subdirectories(directory: string): Promise<string[]> {
	if (!(await pathExists(directory))) {
		return [];
	}

	const entries = await readdir(directory, { withFileTypes: true });

	return entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => join(directory, entry.name))
		.toSorted();
}

async function pluginName(plugin: string): Promise<string[]> {
	const manifestText = await readJsonObject(
		join(plugin, ".claude-plugin", "plugin.json"),
	);
	const manifest = pluginManifestSchema.safeParse(manifestText);

	return manifest.success ? [manifest.data.name] : [];
}

async function pluginNamesUnder(directory: string): Promise<string[]> {
	const plugins = await subdirectories(directory);
	const names = await Promise.all(
		plugins.map(async (plugin) => await pluginName(plugin)),
	);

	return names.flat();
}

function enabledPluginNames(settings: Immutable<JsonObject>): string[] {
	return Object.entries(objectAt(settings["enabledPlugins"]))
		.filter(([, enabled]) => enabled === true)
		.map(([name]) => name);
}

interface UserSetup {
	readonly settings: Immutable<JsonObject>;
	readonly mcpConfigFiles: readonly string[];
	readonly mcpServers: Immutable<JsonObject>;
	readonly pluginDirectories: readonly string[];
	readonly syncedPlugins: readonly string[];
}

async function readUserSetup(home: string): Promise<UserSetup> {
	const settings = await readJsonObject(join(home, ".claude", "settings.json"));
	const mcpConfigPath = join(home, ".claude.json");
	const mcpConfig = await readJsonObject(mcpConfigPath);
	const hasMcpConfig = await pathExists(mcpConfigPath);
	const pluginDirectories = await subdirectories(
		join(home, ".claude", "plugins", "synced"),
	);
	const pluginNames = await Promise.all(
		pluginDirectories.map(async (plugins) => await pluginNamesUnder(plugins)),
	);

	return {
		mcpConfigFiles: hasMcpConfig ? [mcpConfigPath] : [],
		mcpServers: objectAt(mcpConfig["mcpServers"]),
		pluginDirectories,
		settings,
		syncedPlugins: pluginNames.flat(),
	};
}

async function prepareActualSetup({
	home,
	directory,
	declared,
}: ActualSetupSource): Promise<ActualSetup> {
	const user = await readUserSetup(home);
	const settings = mergedSettings(user.settings, declared);
	const settingsText = JSON.stringify(settings);
	const settingsFile = join(directory, "settings.json");

	await writeFile(settingsFile, settingsText);

	return {
		files: {
			kind: "actual",
			mcpConfigFiles: user.mcpConfigFiles,
			pluginDirectories: user.pluginDirectories,
			settingsFile,
		},
		record: {
			hookEvents: Object.keys(objectAt(settings["hooks"])).toSorted(),
			kind: "actual",
			mcpConfigSha256: sha256(JSON.stringify(user.mcpServers)),
			mcpServers: Object.keys(user.mcpServers).toSorted(),
			plugins: [
				...enabledPluginNames(settings),
				...user.syncedPlugins,
			].toSorted(),
			settingsKeys: Object.keys(settings).toSorted(),
			settingsSha256: sha256(settingsText),
		},
	};
}

export { ISOLATED_SETUP, mergedSettings, prepareActualSetup };
export type {
	ActualSetup,
	ActualSetupFiles,
	ActualSetupRecord,
	PreparedSetup,
	SessionSetup,
	SessionSetupRecord,
};
