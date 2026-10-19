import { expect, it } from "bun:test";
import { join } from "node:path";

import { TestResources } from "#benchmark/test-support";

import {
	commandResult,
	policyRepository,
	runPolicy,
} from "./quality-policy-test-support";

const resources = TestResources.forEachTest();

it.each([
	{ ignoreFile: ".gitignore", path: "src/maintained.ts", pattern: "src/*.ts" },
	{
		ignoreFile: "src/.gitignore",
		path: "src/a file.ts",
		pattern: "*.ts",
	},
	{
		ignoreFile: ".git/info/exclude",
		path: "src/maintained.ts",
		pattern: "src/*.ts",
	},
])(
	"refuses $ignoreFile hiding tracked $path from quality checks",
	async ({ ignoreFile, path, pattern }) => {
		const directory = await policyRepository(resources);
		await Bun.write(
			join(directory, path),
			'export const value={name:"test"};\n',
		);
		const staged = await commandResult(directory, ["git", "add", path]);
		expect(staged).toMatchObject({ exitCode: 0 });
		await Bun.write(join(directory, ignoreFile), `${pattern}\n`);

		const result = await runPolicy(directory);

		expect(result).toEqual({
			exitCode: 1,
			stderr: `${path}: Git exclusions must not hide maintained files from quality checks\n`,
			stdout: "",
		});
	},
);

it.each([
	{ path: "cases/example/fixture/source.ts", pattern: "cases/*/fixture/**" },
	{ path: ".benchmark-runs/run/source.ts", pattern: ".benchmark-runs/" },
	{
		path: "copy/.benchmark-runs/run/source.ts",
		pattern: "**/.benchmark-runs/",
	},
])("accepts Git exclusions for protected $path", async ({ path, pattern }) => {
	const directory = await policyRepository(resources);
	await Bun.write(join(directory, path), "export const value = 1;\n");
	const staged = await commandResult(directory, ["git", "add", path]);
	expect(staged).toMatchObject({ exitCode: 0 });
	await Bun.write(join(directory, ".gitignore"), `${pattern}\n`);

	const result = await runPolicy(directory);

	expect(result).toEqual({ exitCode: 0, stderr: "", stdout: "" });
});

it("refuses a Git exclusion hiding newly created source before it is staged", async () => {
	const directory = await policyRepository(resources);
	const path = "src/untracked.ts";
	await Bun.write(join(directory, path), 'export const value={name:"test"};\n');
	await Bun.write(join(directory, ".gitignore"), "src/**\n");

	const result = await runPolicy(directory);

	expect(result).toEqual({
		exitCode: 1,
		stderr: `${path}: Git exclusions must not hide maintained files from quality checks\n`,
		stdout: "",
	});
});

it.each([
	{ path: "node_modules/library/source.ts", pattern: "node_modules/" },
	{ path: "client/dist/bundle.js", pattern: "client/dist/" },
])(
	"keeps generated $path outside maintained source",
	async ({ path, pattern }) => {
		const directory = await policyRepository(resources);
		await Bun.write(
			join(directory, path),
			'export const value={name:"test"};\n',
		);
		await Bun.write(join(directory, ".gitignore"), `${pattern}\n`);

		const result = await runPolicy(directory);

		expect(result).toEqual({ exitCode: 0, stderr: "", stdout: "" });
	},
);
