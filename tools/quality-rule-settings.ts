import { isDeepStrictEqual } from "node:util";

import type { JsonObject, JsonValue } from "#benchmark/json-value";
import { jsonArraySchema, jsonObjectSchema } from "#benchmark/json-value";

import requiredCssSettings from "./required-css-rule-settings.json";
import requiredLintOptions from "./required-lint-rule-options.json";

const lintOptions = jsonObjectSchema.parse(requiredLintOptions);
const cssSettings = jsonObjectSchema.parse(requiredCssSettings);

function nativeRuleName(rule: string): string {
	return rule.startsWith("eslint/") ? rule.slice("eslint/".length) : rule;
}

function lintOptionsMatch(rule: string, setting: JsonValue): boolean {
	const tuple = jsonArraySchema.safeParse(setting);
	const [, ...actual] = tuple.success ? tuple.data : [];
	const required = jsonArraySchema.parse(
		lintOptions[nativeRuleName(rule)] ?? [],
	);
	return isDeepStrictEqual(actual, required);
}

function cssDefaultSeverityFailures(config: Readonly<JsonObject>): string[] {
	const severity = config["defaultSeverity"];
	return severity === undefined || severity === "error"
		? []
		: [".stylelintrc.json: default severity must remain error"];
}

function qualityRuleSettingsFailures(
	name: string,
	config: Readonly<JsonObject>,
	rules: Readonly<JsonObject>,
): string[] {
	if (name === ".oxlintrc.json") {
		return Object.entries(rules).flatMap(([rule, setting]) =>
			lintOptionsMatch(rule, setting)
				? []
				: [`${name}: ${rule} options must match the required policy`],
		);
	}
	if (name === ".stylelintrc.json") {
		return [
			...cssDefaultSeverityFailures(config),
			...Object.entries(cssSettings).flatMap(([rule, required]) =>
				rules[rule] === undefined || isDeepStrictEqual(rules[rule], required)
					? []
					: [`${name}: ${rule} settings must match the required policy`],
			),
		];
	}
	return [];
}

export { qualityRuleSettingsFailures as default };
