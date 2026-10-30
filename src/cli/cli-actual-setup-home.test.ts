import { describe, expect, it } from "bun:test";
import { chmod, mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import { RECORDS_DIRECTORY_VARIABLE } from "#benchmark/config";
import { TestResources } from "#benchmark/test-support";

import { environmentWithoutKnobs, runCli } from "./cli-process-test-driver";

const resources = TestResources.forEachTest();

const COMPARISON_TIMEOUT_MS = 120_000;

const EXECUTABLE_FILE_MODE = 0o755;

const COMPLETED_EXIT_CODE = 0;

/**
 * Answers the model preflight with one JSON document and a session with an
 * init line and a result line, and writes no file anywhere.
 */
const SILENT_CLAUDE = `#!/bin/sh
format=""
session="00000000-0000-4000-8000-000000000000"
previous=""
for argument in "$@"; do
	if [ "$previous" = "--output-format" ]; then format="$argument"; fi
	if [ "$previous" = "--session-id" ]; then session="$argument"; fi
	previous="$argument"
done
if [ "$format" = "stream-json" ]; then
	echo '{"type":"system","subtype":"init","mcp_servers":[],"plugins":[]}'
fi
echo "{\\"type\\":\\"result\\",\\"subtype\\":\\"success\\",\\"is_error\\":false,\\"result\\":\\"OK\\",\\"structured_output\\":{},\\"session_id\\":\\"$session\\",\\"total_cost_usd\\":0.0001,\\"num_turns\\":1,\\"duration_ms\\":1,\\"duration_api_ms\\":1,\\"usage\\":{\\"input_tokens\\":1,\\"output_tokens\\":1,\\"cache_creation_input_tokens\\":0,\\"cache_read_input_tokens\\":0}}"
`;

const HOME_FILES = {
	".claude.json": '{"mcpServers":{}}\n',
	".claude/CLAUDE.md": "live instructions\n",
	".claude/agents/reviewer.md": "live agent\n",
	".claude/output-styles/brief.md": "live brief\n",
	".claude/settings.json": '{"permissions":{"allow":[]}}\n',
	".claude/skills/probe/SKILL.md": "live skill\n",
};

async function writeFiles(
	root: string,
	files: Readonly<Record<string, string>>,
): Promise<void> {
	await Array.fromAsync(Object.entries(files), async ([path, contents]) => {
		await mkdir(dirname(join(root, path)), { recursive: true });
		await Bun.write(join(root, path), contents);
	});
}

/** Every file under the home's Claude paths, by path, with its bytes. */
async function claudeFiles(home: string): Promise<Record<string, string>> {
	const entries = await readdir(join(home, ".claude"), {
		recursive: true,
		withFileTypes: true,
	});
	const paths = [
		join(home, ".claude.json"),
		...entries
			.filter((entry) => entry.isFile())
			.map((entry) => join(entry.parentPath, entry.name)),
	];
	const contents = await Array.fromAsync(
		paths,
		async (path): Promise<[string, string]> => [
			path,
			await Bun.file(path).text(),
		],
	);

	return Object.fromEntries(contents);
}

interface Workspace {
	readonly home: string;
	readonly env: Record<string, string>;
	readonly candidate: string;
	readonly control: string;
}

async function workspace(): Promise<Workspace> {
	const root = await resources.createControlDirectory();
	const home = join(root, "home");
	const bin = join(root, "bin");
	await writeFiles(home, HOME_FILES);
	await writeFiles(bin, { claude: SILENT_CLAUDE });
	await chmod(join(bin, "claude"), EXECUTABLE_FILE_MODE);
	await writeFiles(root, {
		"candidate/output-styles/brief.md": "candidate brief\n",
		"candidate/skills/probe/SKILL.md": "candidate skill\n",
		"control/output-styles/brief.md": "control brief\n",
	});

	return {
		candidate: join(root, "candidate"),
		control: join(root, "control"),
		env: {
			...environmentWithoutKnobs(),
			HOME: home,
			PATH: `${bin}:${Bun.env["PATH"] ?? ""}`,
			[RECORDS_DIRECTORY_VARIABLE]: join(root, "records"),
		},
		home,
	};
}

async function confirmationGroup(
	env: Readonly<Record<string, string>>,
	corpus: readonly string[],
): Promise<string> {
	const result = await runCli(
		[
			"run",
			"--case",
			"smoke",
			"--model",
			"sonnet",
			"--effort",
			"medium",
			"--confirm",
			"--reps",
			"2",
			"--yes",
			...corpus,
		],
		"empty",
		env,
	);
	const group = /Confirmation group: (?<path>\S+)/u.exec(result.stderr)
		?.groups?.["path"];
	if (group === undefined) {
		throw new Error(`no confirmation group: ${result.stderr}`);
	}

	return group;
}

/**
 * Claude Code itself rewrites ~/.claude.json and writes transcripts under
 * ~/.claude, so a fake that writes nothing is what isolates Rehearse's own
 * writes there.
 */
async function leavesEveryClaudeFileOfTheHomeByteIdentical(): Promise<void> {
	const { home, env, candidate, control } = await workspace();
	const before = await claudeFiles(home);
	await runCli(["settings", "--spend-ceiling-usd", "1"], "empty", env);

	const arms = {
		baseline: await confirmationGroup(env, []),
		candidate: await confirmationGroup(env, ["--corpus", candidate]),
		control: await confirmationGroup(env, ["--corpus", control]),
	};
	const manifest = join(dirname(home), "manifest.json");
	await Bun.write(
		manifest,
		JSON.stringify({ cases: [{ arms, caseId: "smoke" }], schemaVersion: 1 }),
	);
	const comparison = await runCli(["compare", manifest], "empty", env);

	expect(comparison.exitCode).toBe(COMPLETED_EXIT_CODE);
	expect(await claudeFiles(home)).toEqual(before);
}

describe("a comparison run with the actual setup", () => {
	it(
		"leaves every Claude file of the home byte-identical",
		leavesEveryClaudeFileOfTheHomeByteIdentical,
		COMPARISON_TIMEOUT_MS,
	);
});
