import { expect, it } from "bun:test";
import { join } from "node:path";

import { TestResources } from "#benchmark/test-support";

import {
	commandResult,
	completeLintConfig,
	policyRepository,
	runPolicy,
} from "./quality-policy-test-support";
import completeCssRules from "./required-css-rule-settings.json";

const resources = TestResources.forEachTest();

it("refuses disabling formatter import organization", async () => {
	const directory = await policyRepository(resources);
	await Bun.write(join(directory, ".oxfmtrc.json"), '{"sortImports":false}');

	const result = await runPolicy(directory);

	expect(result).toEqual({
		exitCode: 1,
		stderr: ".oxfmtrc.json: import organization must remain enabled\n",
		stdout: "",
	});
});

it.each([
	{ exclusion: "", inputs: "cases/example/fixture" },
	{ exclusion: "/.delta/worktrees/\n", inputs: ".delta/worktrees/checkout" },
	{ exclusion: "/.delta/clones/\n", inputs: ".delta/clones/checkout" },
])(
	"accepts protected inputs in $inputs containing bypasses and private configurations",
	async ({ exclusion, inputs }) => {
		const directory = await policyRepository(resources);
		const marker = ["oxlint", "disable-next-line"].join("-");
		await Bun.write(
			join(directory, inputs, "source.ts"),
			`// ${marker} no-unused-vars
const value = 1;
`,
		);
		await Bun.write(
			join(directory, inputs, ".oxlintrc.json"),
			'{"rules":{"eslint/curly":"off"}}',
		);
		await Bun.write(join(directory, ".git/info/exclude"), exclusion);

		const result = await runPolicy(directory);

		expect(result).toEqual({ exitCode: 0, stderr: "", stdout: "" });
	},
);

it.each([
	["src/untracked.ts", "//", ""],
	["src/.delta/untracked.ts", "//", ""],
	["client/style.css", "/*", " */"],
	["docs/guide.md", "<!--", " -->"],
	["settings.toml", "#", ""],
])(
	"refuses an untracked maintained bypass in %s",
	async (path, opener, closer) => {
		const directory = await policyRepository(resources);
		const marker = ["prettier", "ignore"].join("-");
		await Bun.write(
			join(directory, path),
			`${opener} ${marker}${closer}
`,
		);

		const result = await runPolicy(directory);

		expect(result).toEqual({
			exitCode: 1,
			stderr: `${path}:1: quality-check suppression is forbidden
`,
			stdout: "",
		});
	},
);

it("refuses a bypass in tracked maintained source", async () => {
	const expectedExitCode = 0;

	const directory = await policyRepository(resources);
	const path = "src/tracked.ts";
	const marker = ["oxlint", "disable-next-line"].join("-");
	await Bun.write(
		join(directory, path),
		`// ${marker} no-unused-vars
const value = 1;
`,
	);
	const staged = await commandResult(directory, ["git", "add", path]);
	expect(staged.exitCode).toBe(expectedExitCode);

	const result = await runPolicy(directory);

	expect(result).toEqual({
		exitCode: 1,
		stderr: `${path}:1: quality-check suppression is forbidden
`,
		stdout: "",
	});
});

it("refuses additional quality configurations discovered outside protected inputs", async () => {
	const directory = await policyRepository(resources);
	await Bun.write(join(directory, "client/.oxlintrc.json"), "{}");

	const result = await runPolicy(directory);

	expect(result).toEqual({
		exitCode: 1,
		stderr: `client/.oxlintrc.json: additional quality configurations are forbidden
`,
		stdout: "",
	});
});
it("refuses a nested package-based Stylelint configuration", async () => {
	const directory = await policyRepository(resources);
	await Bun.write(
		join(directory, "client/package.json"),
		JSON.stringify({ stylelint: { rules: { "color-no-hex": null } } }),
	);

	const result = await runPolicy(directory);

	expect(result).toEqual({
		exitCode: 1,
		stderr:
			"client/package.json: package-based quality configuration stylelint is forbidden\n",
		stdout: "",
	});
});

it("refuses deletion of a required rule from the root config", async () => {
	const directory = await policyRepository(resources);
	const rules = { ...completeLintConfig().rules };
	delete rules["curly"];
	await Bun.write(join(directory, ".oxlintrc.json"), JSON.stringify({ rules }));

	const result = await runPolicy(directory);

	expect(result).toEqual({
		exitCode: 1,
		stderr: ".oxlintrc.json: required rule curly is missing\n",
		stdout: "",
	});
});
it("refuses deletion of a required CSS rule from the root config", async () => {
	const directory = await policyRepository(resources);
	await Bun.write(
		join(directory, ".stylelintrc.json"),
		JSON.stringify({
			rules: {
				"declaration-property-unit-disallowed-list":
					completeCssRules["declaration-property-unit-disallowed-list"],
			},
		}),
	);

	const result = await runPolicy(directory);

	expect(result).toEqual({
		exitCode: 1,
		stderr:
			".stylelintrc.json: required rule rehearse/color-token-palette is missing\n",
		stdout: "",
	});
});
