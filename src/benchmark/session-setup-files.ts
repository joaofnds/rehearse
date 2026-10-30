import { readFile, readdir } from "node:fs/promises";
import { delimiter, join } from "node:path";

import { z } from "zod";

import type { Immutable } from "./contracts";
import { pathExists } from "./file-presence";
import { jsonObjectSchema } from "./json-value";
import type { JsonObject, JsonValue } from "./json-value";

const PLUGIN_DIRECTORIES_VARIABLE = "CLAUDE_CODE_PLUGIN_DIRS";
const pluginManifestSchema = z.object({ name: z.string().nonempty() });

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

/**
 * A plugin whose manifest is missing or malformed is left unnamed rather than
 * stopping the run, since the name only feeds the record.
 */
async function pluginName(plugin: string): Promise<string[]> {
	const manifestPath = join(plugin, ".claude-plugin", "plugin.json");
	if (!(await pathExists(manifestPath))) {
		return [];
	}

	try {
		const manifest = pluginManifestSchema.safeParse(
			JSON.parse(await readFile(manifestPath, "utf8")),
		);

		return manifest.success ? [manifest.data.name] : [];
	} catch {
		return [];
	}
}

async function pluginNamesUnder(directory: string): Promise<string[]> {
	const plugins = await subdirectories(directory);
	const names = await Promise.all(
		plugins.map(async (plugin) => await pluginName(plugin)),
	);

	return names.flat();
}

/** The plugins named by a `CLAUDE_CODE_PLUGIN_DIRS` value, which is a path list. */
async function pluginNamesInDirectoryList(
	directoryList: Immutable<JsonValue> | undefined,
): Promise<string[]> {
	const list = z.string().safeParse(directoryList);
	if (!list.success) {
		return [];
	}

	const plugins = list.data.split(delimiter).filter((plugin) => plugin !== "");
	const names = await Promise.all(
		plugins.map(async (plugin) => await pluginName(plugin)),
	);

	return names.flat();
}

export {
	PLUGIN_DIRECTORIES_VARIABLE,
	pluginNamesInDirectoryList,
	pluginNamesUnder,
	readJsonObject,
	subdirectories,
};
