import { expect, it } from "bun:test";

import { qualityConfigFailures } from "./quality-policy";
import { completeLintConfig } from "./quality-policy-test-support";
import completeCssRules from "./required-css-rule-settings.json";

const NUMERIC_DISABLED_SEVERITY = 0;
const NUMERIC_WARNING_SEVERITY = 1;
const NUMERIC_ERROR_SEVERITY = 2;

it.each([
	{ names: [] },
	{ names: ["cb"] },
	{ names: ["callback"] },
	{ names: ["next"] },
])("rejects narrowed completion callback names $names", ({ names }) => {
	const rules = {
		...completeLintConfig().rules,
		"node/callback-return": ["error", names],
	};
	expect(
		qualityConfigFailures(".oxlintrc.json", JSON.stringify({ rules })),
	).toContain(".oxlintrc.json: callback-return must protect callback and cb");
});

it("retains native callback checks beside awaited next enforcement", () => {
	const rules = {
		...completeLintConfig().rules,
		"node/callback-return": ["error", ["callback", "cb"]],
	};
	expect(
		qualityConfigFailures(".oxlintrc.json", JSON.stringify({ rules })),
	).toEqual([]);
});

it("requires formatter import organization", () => {
	expect(qualityConfigFailures(".oxfmtrc.json", "{}")).toEqual([
		".oxfmtrc.json: import organization must remain enabled",
	]);
	expect(
		qualityConfigFailures(".oxfmtrc.json", '{"sortImports":false}'),
	).toEqual([".oxfmtrc.json: import organization must remain enabled"]);
	expect(
		qualityConfigFailures(".oxfmtrc.json", '{"sortImports":true}'),
	).toEqual([]);
});

it("accepts the complete required CSS rule set", () => {
	expect(
		qualityConfigFailures(
			".stylelintrc.json",
			JSON.stringify({ rules: completeCssRules }),
		),
	).toEqual([]);
});

it("rejects an empty CSS rule inventory", () => {
	expect(qualityConfigFailures(".stylelintrc.json", '{"rules":{}}')).toEqual([
		".stylelintrc.json: required rule declaration-property-unit-disallowed-list is missing",
		".stylelintrc.json: required rule rehearse/color-token-palette is missing",
	]);
});

it.each([
	{
		rule: "declaration-property-unit-disallowed-list",
		rules: { "rehearse/color-token-palette": true },
	},
	{
		rule: "rehearse/color-token-palette",
		rules: {
			"declaration-property-unit-disallowed-list":
				completeCssRules["declaration-property-unit-disallowed-list"],
		},
	},
])("rejects deletion of required CSS rule $rule", ({ rule, rules }) => {
	expect(
		qualityConfigFailures(".stylelintrc.json", JSON.stringify({ rules })),
	).toEqual([`.stylelintrc.json: required rule ${rule} is missing`]);
});

it("rejects deletion of a required lint rule", () => {
	const rules = { ...completeLintConfig().rules };
	delete rules["curly"];

	expect(
		qualityConfigFailures(".oxlintrc.json", JSON.stringify({ rules })),
	).toEqual([".oxlintrc.json: required rule curly is missing"]);
});

it("rejects an empty lint rule inventory", () => {
	expect(qualityConfigFailures(".oxlintrc.json", '{"rules":{}}')).toContain(
		".oxlintrc.json: required rule curly is missing",
	);
});

it.each(["stylelint", "eslintConfig", "prettier"])(
	"rejects package-based %s configuration",
	(key) => {
		const text = JSON.stringify({
			[key]: { rules: { "color-no-hex": null } },
		});

		expect(qualityConfigFailures("client/package.json", text)).toEqual([
			`client/package.json: package-based quality configuration ${key} is forbidden`,
		]);
	},
);

it.each(["off", "warn", NUMERIC_DISABLED_SEVERITY, NUMERIC_WARNING_SEVERITY])(
	"rejects lint severity %s",
	(severity) => {
		const text = JSON.stringify({
			rules: { ...completeLintConfig().rules, "eslint/curly": severity },
		});

		expect(qualityConfigFailures(".oxlintrc.json", text)).not.toEqual([]);
	},
);

it("rejects a rule disabled inside an option tuple", () => {
	const text = JSON.stringify({
		rules: { ...completeLintConfig().rules, "eslint/curly": ["off", {}] },
	});

	expect(qualityConfigFailures(".oxlintrc.json", text)).not.toEqual([]);
});

it("accepts numeric errors with the required rule options", () => {
	const text = JSON.stringify({
		rules: {
			...completeLintConfig().rules,
			"one-var": [NUMERIC_ERROR_SEVERITY, "never"],
		},
	});

	expect(qualityConfigFailures(".oxlintrc.json", text)).toEqual([]);
});

it("rejects a disabled CSS rule", () => {
	const text = JSON.stringify({
		rules: { ...completeCssRules, "color-no-hex": null },
	});

	expect(qualityConfigFailures(".stylelintrc.json", text)).not.toEqual([]);
});

it("rejects CSS warnings in rule options", () => {
	const text = JSON.stringify({
		rules: {
			...completeCssRules,
			"color-no-hex": [true, { severity: "warning" }],
		},
	});

	expect(qualityConfigFailures(".stylelintrc.json", text)).not.toEqual([]);
});

it("rejects warning-only lint categories", () => {
	const text = JSON.stringify({
		categories: { correctness: "warn" },
		rules: completeLintConfig().rules,
	});

	expect(qualityConfigFailures(".oxlintrc.json", text)).not.toEqual([]);
});

it.each([".oxlintrc.json", ".oxfmtrc.json", ".stylelintrc.json"])(
	"rejects a source exclusion in %s",
	(name) => {
		const key = name === ".stylelintrc.json" ? "ignoreFiles" : "ignorePatterns";
		const text = JSON.stringify({
			rules:
				name === ".stylelintrc.json"
					? completeCssRules
					: completeLintConfig().rules,
			sortImports: true,
			[key]: ["tools/**"],
		});

		expect(qualityConfigFailures(name, text)).not.toEqual([]);
	},
);

it("keeps experiment inputs and historical evidence outside source checks", () => {
	const text = JSON.stringify({
		ignorePatterns: ["cases/*/fixture/**", "docs/recovered/**"],
		sortImports: true,
	});

	expect(qualityConfigFailures(".oxfmtrc.json", text)).toEqual([]);
});

it("rejects per-file rule overrides", () => {
	const text = JSON.stringify({
		overrides: [{ files: ["tools/**"], rules: {} }],
		rules: completeLintConfig().rules,
	});

	expect(qualityConfigFailures(".oxlintrc.json", text)).not.toEqual([]);
});
