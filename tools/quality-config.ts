import { basename } from "node:path";

import { z } from "zod";

import type { JsonObject, JsonValue } from "#benchmark/json-value";
import { jsonObjectSchema, jsonValueSchema } from "#benchmark/json-value";

import inputPatterns from "./quality-inputs";
import qualityRuleSettingsFailures from "./quality-rule-settings";
import requiredRules from "./required-lint-rules.json";

const LINT_ERROR_SEVERITY = 2;
const SEVERITY_ONLY_SETTING_LENGTH = 1;

const requiredConfigRules: ReadonlyMap<string, readonly string[]> = new Map([
	[".oxlintrc.json", requiredRules],
	[
		".stylelintrc.json",
		[
			"declaration-property-unit-disallowed-list",
			"rehearse/color-token-palette",
		],
	],
]);
const packageConfigKeys = ["stylelint", "eslintConfig", "prettier"];
const errorSeverity = z.union([
	z.literal("error"),
	z.literal(LINT_ERROR_SEVERITY),
]);
const lintRule = z.union([
	errorSeverity,
	z.tuple([errorSeverity]).rest(jsonValueSchema),
]);

function cssRuleIsError(setting: JsonValue): boolean {
	const tuple = z.array(jsonValueSchema).safeParse(setting);
	const [primarySetting, optionsSetting] = tuple.success ? tuple.data : [];
	const primary = tuple.success ? primarySetting : setting;
	const options = jsonObjectSchema.safeParse(
		tuple.success ? optionsSetting : {},
	);
	return (
		primary !== null &&
		primary !== false &&
		primary !== undefined &&
		!(
			options.success &&
			options.data["severity"] !== undefined &&
			options.data["severity"] !== "error"
		)
	);
}

function retainsCompletionCallbacks(setting: JsonValue | undefined): boolean {
	const tuple = z.array(jsonValueSchema).safeParse(setting);
	if (!tuple.success || tuple.data.length === SEVERITY_ONLY_SETTING_LENGTH) {
		return true;
	}
	const [, configuredNames] = tuple.data;
	const names = z.array(z.string()).safeParse(configuredNames);
	return (
		names.success &&
		names.data.includes("callback") &&
		names.data.includes("cb")
	);
}

function completionConfigFailures(
	name: string,
	setting: JsonValue | undefined,
): string[] {
	return name === ".oxlintrc.json" && !retainsCompletionCallbacks(setting)
		? [`${name}: callback-return must protect callback and cb`]
		: [];
}

function rootStructureFailures(
	name: string,
	config: Readonly<JsonObject>,
	configuredRules: Readonly<JsonObject>,
): string[] {
	const failures: string[] = [];
	if (name === ".oxfmtrc.json" && config["sortImports"] !== true) {
		failures.push(`${name}: import organization must remain enabled`);
	}
	failures.push(
		...completionConfigFailures(name, configuredRules["node/callback-return"]),
	);
	for (const rule of requiredConfigRules.get(name) ?? []) {
		if (!Object.hasOwn(configuredRules, rule)) {
			failures.push(`${name}: required rule ${rule} is missing`);
		}
	}
	if (Object.hasOwn(config, "overrides")) {
		failures.push(`${name}: per-file rule overrides are forbidden`);
	}
	return failures;
}

function exclusionFailures(
	name: string,
	config: Readonly<JsonObject>,
): string[] {
	const failures: string[] = [];
	for (const key of ["ignorePatterns", "ignoreFiles"]) {
		const patterns = z.array(z.string()).parse(config[key] ?? []);
		for (const pattern of patterns) {
			if (!inputPatterns.has(pattern)) {
				failures.push(`${name}: source exclusion ${pattern} is forbidden`);
			}
		}
	}
	return failures;
}

function settingIsError(name: string, setting: JsonValue): boolean {
	return name === ".stylelintrc.json"
		? cssRuleIsError(setting)
		: lintRule.safeParse(setting).success;
}

function severityFailures(
	name: string,
	config: Readonly<JsonObject>,
): string[] {
	const failures: string[] = [];
	for (const section of ["rules", "categories"]) {
		const rules = jsonObjectSchema.parse(config[section] ?? {});
		for (const [rule, setting] of Object.entries(rules)) {
			if (!settingIsError(name, setting)) {
				failures.push(`${name}: ${rule} must remain enabled at error severity`);
			}
		}
	}
	return failures;
}

function qualityConfigFailures(name: string, text: string): string[] {
	const config = jsonObjectSchema.parse(JSON.parse(text));
	if (basename(name) === "package.json") {
		return packageConfigKeys
			.filter((key) => Object.hasOwn(config, key))
			.map(
				(key) =>
					`${name}: package-based quality configuration ${key} is forbidden`,
			);
	}
	const configuredRules = jsonObjectSchema.parse(config["rules"] ?? {});
	return [
		...rootStructureFailures(name, config, configuredRules),
		...exclusionFailures(name, config),
		...severityFailures(name, config),
		...qualityRuleSettingsFailures(name, config, configuredRules),
	];
}

export { qualityConfigFailures as default };
