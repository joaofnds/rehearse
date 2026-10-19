import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { z } from "zod";

const OXLINT_SUCCESS_EXIT_CODE = 0;
const OXLINT_DIAGNOSTICS_EXIT_CODE = 1;

const root = resolve(import.meta.dir, "../../..");
const diagnosticSpanSchema = z.object({
	column: z.number(),
	length: z.number(),
	line: z.number(),
});
const diagnosticLabelSchema = z.object({ span: diagnosticSpanSchema });
const diagnosticSchema = z.object({
	code: z.string(),
	labels: z.array(diagnosticLabelSchema),
});
const lintResult = z.object({ diagnostics: z.array(diagnosticSchema) });

interface RuleFixture {
	readonly name: string;
	readonly rule: string;
	readonly locations: readonly DiagnosticLocation[];
	readonly source: string;
}

interface DiagnosticLocation {
	readonly line: number;
	readonly column: number;
	readonly length: number;
}

interface RuleDiagnostic extends DiagnosticLocation {
	readonly code: string;
}

async function configurationForRule(
	directory: string,
	enabledRule: string | null,
): Promise<string> {
	const config = join(root, ".oxlintrc.json");
	if (enabledRule === null) {
		return config;
	}

	const fixtureConfig = join(directory, "oxlint.json");
	await Bun.write(
		fixtureConfig,
		JSON.stringify({ extends: [config], rules: { [enabledRule]: "error" } }),
	);

	return fixtureConfig;
}

async function lintFile(
	input: string,
	flags: readonly string[],
	config: string,
): Promise<readonly RuleDiagnostic[]> {
	const child = Bun.spawn(
		[
			join(root, "node_modules/.bin/oxlint"),
			"--config",
			config,
			input,
			"--format",
			"json",
			...flags,
		],
		{ cwd: root, env: { ...Bun.env }, stderr: "pipe", stdout: "pipe" },
	);
	const [output, errors, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	if (
		exitCode !== OXLINT_SUCCESS_EXIT_CODE &&
		exitCode !== OXLINT_DIAGNOSTICS_EXIT_CODE
	) {
		throw new Error(`Oxlint exited with ${String(exitCode)}: ${errors}`);
	}

	return lintResult
		.parse(JSON.parse(output))
		.diagnostics.flatMap((diagnostic) =>
			diagnostic.labels.map(({ span }) => ({ code: diagnostic.code, ...span })),
		);
}

async function ruleDiagnostics(
	source: string,
	flags: readonly string[] = [],
	enabledRule: string | null = null,
): Promise<readonly RuleDiagnostic[]> {
	const directory = await mkdtemp(join(tmpdir(), "rehearse-rule-test-"));
	try {
		const input = join(directory, "input.tsx");
		const config = await configurationForRule(directory, enabledRule);
		await Bun.write(input, source);

		return await lintFile(input, flags, config);
	} finally {
		await rm(directory, { force: true, recursive: true });
	}
}

export { ruleDiagnostics as default };
export type { RuleFixture };
