import { describe, expect, it } from "bun:test";

import { mergedSettings } from "#benchmark/session-setup";

function replacesAUserKeyTheHarnessDeclares(): void {
	const merged = mergedSettings(
		{ outputStyle: "brief", theme: "dark" },
		{ outputStyle: "Explanatory" },
	);

	expect(merged).toEqual({ outputStyle: "Explanatory", theme: "dark" });
}

function keepsTheUserDenyRulesBesideTheDeclaredGrants(): void {
	const merged = mergedSettings(
		{ permissions: { allow: ["Read"], deny: ["Bash(rm:*)"] } },
		{ permissions: { allow: ["Edit"] } },
	);

	expect(merged).toEqual({
		permissions: { allow: ["Read", "Edit"], deny: ["Bash(rm:*)"] },
	});
}

function dropsTheUserModelAndEffortSoTheRunDecidesThem(): void {
	const merged = mergedSettings(
		{ effortLevel: "max", model: "opus", theme: "dark" },
		{},
	);

	expect(merged).toEqual({ theme: "dark" });
}

function dropsTheModelAndEffortACaseDeclares(): void {
	const merged = mergedSettings({}, { effortLevel: "low", model: "opus" });

	expect(merged).toEqual({});
}

function dropsTheModelAndEffortTheUserEnvironmentSetsAndKeepsTheRest(): void {
	const merged = mergedSettings(
		{
			env: {
				ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-opus-5-5",
				CLAUDE_CODE_EFFORT_LEVEL: "max",
				OTEL_LOGS_EXPORTER: "otlp",
			},
		},
		{},
	);

	expect(merged).toEqual({ env: { OTEL_LOGS_EXPORTER: "otlp" } });
}

describe(mergedSettings.name, () => {
	it(
		"replaces a user key the harness declares",
		replacesAUserKeyTheHarnessDeclares,
	);
	it(
		"keeps the user deny rules beside the declared grants",
		keepsTheUserDenyRulesBesideTheDeclaredGrants,
	);
	it(
		"drops the user model and effort so the run decides them",
		dropsTheUserModelAndEffortSoTheRunDecidesThem,
	);
	it(
		"drops the model and effort a case declares",
		dropsTheModelAndEffortACaseDeclares,
	);
	it(
		"drops the model and effort the user environment sets and keeps the rest",
		dropsTheModelAndEffortTheUserEnvironmentSetsAndKeepsTheRest,
	);
});
