import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import type { JsonValue } from "#benchmark/json-value";
import { jsonObjectSchema } from "#benchmark/json-value";

import { qualityConfigFailures } from "./quality-policy";

const NUMERIC_ERROR_SEVERITY = 2;

const lintConfig = jsonObjectSchema.parse(
	await Bun.file(join(import.meta.dir, "../.oxlintrc.json")).json(),
);
const lintRules = jsonObjectSchema.parse(lintConfig["rules"]);
const cssConfig = jsonObjectSchema.parse(
	await Bun.file(join(import.meta.dir, "../.stylelintrc.json")).json(),
);
const cssRules = jsonObjectSchema.parse(cssConfig["rules"]);

function changedLintFailures(rule: string, setting: JsonValue): string[] {
	return qualityConfigFailures(
		".oxlintrc.json",
		JSON.stringify({ rules: { ...lintRules, [rule]: setting } }),
	);
}

const weakenedRules = [
	{ rule: "no-shadow", setting: "error" },
	{ rule: "max-params", setting: ["error", { max: 1_000_000 }] },
	{ rule: "eslint/max-params", setting: ["error", { max: 1_000_000 }] },
	{ rule: "no-console", setting: ["error", { allow: ["log", "error"] }] },
	{
		rule: "capitalized-comments",
		setting: ["error", "always", { ignorePattern: ".*" }],
	},
	{ rule: "one-var", setting: "error" },
];

describe("qualityConfigFailures lint settings", () => {
	it("accepts the configured lint policy", () => {
		expect(
			qualityConfigFailures(".oxlintrc.json", JSON.stringify(lintConfig)),
		).toEqual([]);
	});

	it("accepts numeric error severity with the required options", () => {
		expect(
			changedLintFailures("one-var", [NUMERIC_ERROR_SEVERITY, "never"]),
		).toEqual([]);
	});

	it("accepts the default parameter limit in a severity tuple", () => {
		expect(changedLintFailures("max-params", [NUMERIC_ERROR_SEVERITY])).toEqual(
			[],
		);
	});

	it.each(weakenedRules)(
		"rejects a policy change hidden in $rule",
		({ rule, setting }) => {
			expect(changedLintFailures(rule, setting)).toContain(
				`.oxlintrc.json: ${rule} options must match the required policy`,
			);
		},
	);
});

describe("qualityConfigFailures CSS settings", () => {
	it("accepts the configured CSS policy", () => {
		expect(
			qualityConfigFailures(".stylelintrc.json", JSON.stringify(cssConfig)),
		).toEqual([]);
	});

	it("rejects lowering the default CSS severity", () => {
		const config = { ...cssConfig, defaultSeverity: "warning" };

		expect(
			qualityConfigFailures(".stylelintrc.json", JSON.stringify(config)),
		).toContain(".stylelintrc.json: default severity must remain error");
	});

	it("rejects clearing every property from the required unit rule", () => {
		const rules = {
			...cssRules,
			"declaration-property-unit-disallowed-list": [{}, { severity: "error" }],
		};

		expect(
			qualityConfigFailures(".stylelintrc.json", JSON.stringify({ rules })),
		).toContain(
			".stylelintrc.json: declaration-property-unit-disallowed-list settings must match the required policy",
		);
	});
});
