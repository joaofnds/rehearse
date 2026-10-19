import { describe, expect, it } from "bun:test";
import { join, resolve } from "node:path";

import { TestResources } from "#benchmark/test-support";

import {
	commandResult,
	policyRepository,
	runPolicy,
} from "./quality-policy-test-support";

const SUCCESS_EXIT_CODE = 0;
const resources = TestResources.forEachTest();

async function gitResult(
	directory: string,
	command: readonly string[],
): Promise<string> {
	const result = await commandResult(directory, ["git", ...command]);
	if (result.exitCode !== SUCCESS_EXIT_CODE) {
		throw new Error(result.stderr);
	}

	return result.stdout.trim();
}

async function embeddedRepository(
	path: string,
	source: string,
): Promise<string> {
	const directory = await policyRepository(resources);
	const nested = join(directory, path);
	const initialized = await commandResult(directory, [
		"git",
		"init",
		"-q",
		nested,
	]);

	if (initialized.exitCode !== SUCCESS_EXIT_CODE) {
		throw new Error(initialized.stderr);
	}

	await Bun.write(join(nested, "maintained.ts"), source);

	return directory;
}

async function rejectsIgnoredSource(): Promise<void> {
	const directory = await embeddedRepository(
		"src/nested",
		"export const value = 1;\n",
	);
	await Bun.write(join(directory, ".gitignore"), "src/nested/**\n");

	const result = await runPolicy(directory);

	expect(result).toEqual({
		exitCode: 1,
		stderr:
			"src/nested/maintained.ts: Git exclusions must not hide maintained files from quality checks\n",
		stdout: "",
	});
}

async function checksNestedSuppressions(): Promise<void> {
	const directory = await embeddedRepository(
		"src/nested",
		"// oxlint-disable\nexport const value = 1;\n",
	);

	const result = await runPolicy(directory);

	expect(result).toEqual({
		exitCode: 1,
		stderr:
			"src/nested/maintained.ts:1: quality-check suppression is forbidden\n",
		stdout: "",
	});
}

async function preservesProtectedFixture(): Promise<void> {
	const directory = await embeddedRepository(
		"cases/example/fixture",
		"// oxlint-disable\nexport const value = 1;\n",
	);
	await Bun.write(join(directory, ".gitignore"), "cases/*/fixture/**\n");

	const result = await runPolicy(directory);

	expect(result).toEqual({ exitCode: 0, stderr: "", stdout: "" });
}

async function ordinaryRepository(): Promise<string> {
	return await embeddedRepository("src/nested", "export const value = 1;\n");
}

async function linkedRepository(): Promise<string> {
	const directory = await policyRepository(resources);
	const origin = await policyRepository(resources);

	await gitResult(origin, [
		"-c",
		"user.name=Quality test",
		"-c",
		"user.email=quality@example.test",
		"commit",
		"--allow-empty",
		"-q",
		"-m",
		"initial",
	]);
	await gitResult(origin, [
		"worktree",
		"add",
		"--detach",
		"-q",
		join(directory, "src/nested"),
	]);

	await Bun.write(
		join(directory, "src/nested/maintained.ts"),
		"export const value = 1;\n",
	);

	return directory;
}

async function rejectsMetadataExclusion(directory: string): Promise<void> {
	const nested = join(directory, "src/nested");
	const metadata = await gitResult(nested, [
		"rev-parse",
		"--git-path",
		"info/exclude",
	]);
	const exclude = resolve(nested, metadata);

	await Bun.write(exclude, "maintained.ts\n");

	const excluded = await runPolicy(directory);

	expect(excluded).toEqual({
		exitCode: 1,
		stderr:
			"src/nested/maintained.ts: Git exclusions must not hide maintained files from quality checks\n",
		stdout: "",
	});

	await Bun.write(exclude, "");
	const included = await runPolicy(directory);

	expect(included).toEqual({ exitCode: 0, stderr: "", stdout: "" });
}

describe("source quality inside embedded repositories", () => {
	it("refuses hidden source before staging", rejectsIgnoredSource);
	it("checks suppression comments in visible source", checksNestedSuppressions);
	it("retains protected experiment inputs", preservesProtectedFixture);
});

describe.each([
	{ create: ordinaryRepository, kind: "repository directory" },
	{ create: linkedRepository, kind: "linked worktree" },
])("Git metadata in an embedded $kind", ({ create }) => {
	it("refuses hidden untracked source and accepts it after exclusion removal", async () => {
		const directory = await create();

		await rejectsMetadataExclusion(directory);
	});

	it("refuses hidden tracked source and accepts it after exclusion removal", async () => {
		const directory = await create();
		await gitResult(join(directory, "src/nested"), ["add", "maintained.ts"]);

		await rejectsMetadataExclusion(directory);
	});
});
