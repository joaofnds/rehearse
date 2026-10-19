import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { TestResources } from "#benchmark/test-support";

import {
	completeLintConfig,
	policyRepository,
	runPolicy,
} from "./quality-policy-test-support";
import completeCssRules from "./required-css-rule-settings.json";

describe("quality policy CLI settings", () => {
	const resources = TestResources.forEachTest();

	it("refuses a parameter limit that conceals a rejected function", async () => {
		const directory = await policyRepository(resources);
		const rules = {
			...completeLintConfig().rules,
			"max-params": ["error", { max: 1_000_000 }],
		};
		await Bun.write(
			join(directory, ".oxlintrc.json"),
			JSON.stringify({ rules }),
		);

		const result = await runPolicy(directory);

		expect(result).toEqual({
			exitCode: 1,
			stderr:
				".oxlintrc.json: max-params options must match the required policy\n",
			stdout: "",
		});
	});

	it("refuses clearing the required CSS unit restrictions", async () => {
		const directory = await policyRepository(resources);
		const rules = {
			...completeCssRules,
			"declaration-property-unit-disallowed-list": [{}, { severity: "error" }],
		};
		await Bun.write(
			join(directory, ".stylelintrc.json"),
			JSON.stringify({ rules }),
		);

		const result = await runPolicy(directory);

		expect(result).toEqual({
			exitCode: 1,
			stderr:
				".stylelintrc.json: declaration-property-unit-disallowed-list settings must match the required policy\n",
			stdout: "",
		});
	});
});
