import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { JsonValue } from "#benchmark/json-value";
import { jsonArraySchema, jsonObjectSchema } from "#benchmark/json-value";
import type { TestResources } from "#benchmark/test-support";

import completeCssRules from "./required-css-rule-settings.json";
import requiredLintOptions from "./required-lint-rule-options.json";
import requiredRules from "./required-lint-rules.json";

const SUCCESS_EXIT_CODE = 0;

interface TestLintConfig {
	readonly rules: Readonly<Record<string, JsonValue>>;
}

function completeLintConfig(): TestLintConfig {
	const rules: Record<string, JsonValue> = {};
	const requiredOptions = jsonObjectSchema.parse(requiredLintOptions);
	for (const rule of requiredRules) {
		rules[rule] = [
			"error",
			...jsonArraySchema.parse(requiredOptions[rule] ?? []),
		];
	}
	return { rules };
}

interface PolicyResult {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}

async function policyRepository(
	resources: Readonly<Pick<TestResources, "track">>,
): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "rehearse-quality-policy-"));
	resources.track(directory);
	const initialized = await commandResult(directory, ["git", "init", "-q"]);
	if (initialized.exitCode !== SUCCESS_EXIT_CODE) {
		throw new Error(initialized.stderr);
	}
	const lintRules = completeLintConfig().rules;
	await Promise.all([
		Bun.write(
			join(directory, ".oxlintrc.json"),
			JSON.stringify({ rules: lintRules }),
		),
		Bun.write(join(directory, ".oxfmtrc.json"), '{"sortImports":true}'),
		Bun.write(
			join(directory, ".stylelintrc.json"),
			JSON.stringify({ rules: completeCssRules }),
		),
	]);
	return directory;
}

async function commandResult(
	directory: string,
	command: readonly string[],
): Promise<PolicyResult> {
	const child = Bun.spawn([...command], {
		cwd: directory,
		env: { ...Bun.env },
		stderr: "pipe",
		stdout: "pipe",
	});
	const [exitCode, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	return { exitCode, stderr, stdout };
}

async function runPolicy(directory: string): Promise<PolicyResult> {
	return await commandResult(directory, [
		process.execPath,
		join(import.meta.dir, "quality-policy.ts"),
	]);
}

export { completeLintConfig, commandResult, policyRepository, runPolicy };
