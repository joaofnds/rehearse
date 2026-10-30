import { describe, expect, it } from "bun:test";
import type { Dirent } from "node:fs";
import { chmod, mkdir, readdir, readlink, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";

import { RECORDS_DIRECTORY_VARIABLE } from "#benchmark/config";
import type { Immutable } from "#benchmark/contracts";
import { TestResources } from "#benchmark/test-support";

import { environmentWithoutKnobs, runCli } from "./cli-process-test-driver";

const resources = TestResources.forEachTest();

const COMPARISON_TIMEOUT_MS = 120_000;

const EXECUTABLE_FILE_MODE = 0o755;

const COMPLETED_EXIT_CODE = 0;

/**
 * Answers the model preflight with one JSON document and a session with an
 * init line and a result line. It writes nothing but a listing of each
 * session's installed corpus, path and first line, to `$INSTALL_LOG`.
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
	(cd .claude && find . -type f | sort | while read -r file; do
		printf '%s\t%s\n' "$file" "$(head -n 1 "$file")"
	done) >> "$INSTALL_LOG"
	echo '{"type":"system","subtype":"init","mcp_servers":[],"plugins":[]}'
fi
echo "{\\"type\\":\\"result\\",\\"subtype\\":\\"success\\",\\"is_error\\":false,\\"result\\":\\"OK\\",\\"structured_output\\":{},\\"session_id\\":\\"$session\\",\\"total_cost_usd\\":0.0001,\\"num_turns\\":1,\\"duration_ms\\":1,\\"duration_api_ms\\":1,\\"usage\\":{\\"input_tokens\\":1,\\"output_tokens\\":1,\\"cache_creation_input_tokens\\":0,\\"cache_read_input_tokens\\":0}}"
`;

const HOME_FILES = {
	".agents/rulebook/ownership.md": "live rule\n",
	".claude.json": '{"mcpServers":{}}\n',
	".claude/CLAUDE.md":
		"live instructions\nRead ~/.agents/rulebook/ownership.md and $HOME/.claude/rulebook/ownership.md.\n",
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

/** The entry at `path` as its kind, with its bytes or its link target. */
async function entryContents(
	path: string,
	entry: Readonly<Dirent>,
): Promise<string> {
	if (entry.isSymbolicLink()) {
		return `link ${await readlink(path)}`;
	}
	if (entry.isDirectory()) {
		return "directory";
	}

	return await Bun.file(path).text();
}

/**
 * Every entry under the home's Claude and agent paths, by path, with its
 * contents, since a home-path citation names files under both.
 */
async function claudeEntries(home: string): Promise<Record<string, string>> {
	const entries = await Array.fromAsync(
		[".claude", ".agents"],
		async (directory) =>
			await readdir(join(home, directory), {
				recursive: true,
				withFileTypes: true,
			}),
	);
	const contents = await Array.fromAsync(
		entries.flat(),
		async (entry): Promise<[string, string]> => {
			const path = join(entry.parentPath, entry.name);

			return [path, await entryContents(path, entry)];
		},
	);
	const settings = join(home, ".claude.json");

	return {
		...Object.fromEntries(contents),
		[settings]: await Bun.file(settings).text(),
	};
}

interface Workspace {
	readonly root: string;
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
	await symlink("../.agents/rulebook", join(home, ".claude/rulebook"));
	await writeFiles(bin, { claude: SILENT_CLAUDE });
	await chmod(join(bin, "claude"), EXECUTABLE_FILE_MODE);
	await writeFiles(root, {
		"candidate/CLAUDE.md":
			"candidate instructions\nRead ~/.agents/rulebook/ownership.md.\n",
		"candidate/output-styles/brief.md": "candidate brief\n",
		"candidate/rulebook/ownership.md": "candidate rule\n",
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
		root,
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

/** The workspace's environment with the arm's own installed-corpus log. */
function armEnvironment(
	{ env, root }: Immutable<Workspace>,
	arm: string,
): Workspace["env"] {
	return { ...env, INSTALL_LOG: join(root, `${arm}.log`) };
}

/** The distinct corpus files the arm's sessions found installed. */
async function installedCorpus(log: string): Promise<readonly string[]> {
	const text = await Bun.file(log).text();
	const lines = text.split("\n").filter(Boolean);

	return [...new Set(lines)].toSorted();
}

/**
 * Claude Code itself rewrites ~/.claude.json and writes transcripts under
 * ~/.claude, so a fake that writes nothing is what isolates Rehearse's own
 * writes there.
 */
async function leavesEveryClaudeFileOfTheHomeByteIdentical(): Promise<void> {
	const prepared = await workspace();
	const { home, env, root, candidate, control } = prepared;
	const before = await claudeEntries(home);
	await runCli(["settings", "--spend-ceiling-usd", "1"], "empty", env);

	const arms = {
		baseline: await confirmationGroup(armEnvironment(prepared, "baseline"), []),
		candidate: await confirmationGroup(armEnvironment(prepared, "candidate"), [
			"--corpus",
			candidate,
		]),
		control: await confirmationGroup(armEnvironment(prepared, "control"), [
			"--corpus",
			control,
		]),
	};
	const manifest = join(root, "manifest.json");
	await Bun.write(
		manifest,
		JSON.stringify({ cases: [{ arms, caseId: "smoke" }], schemaVersion: 1 }),
	);
	const comparison = await runCli(["compare", manifest], "empty", env);

	expect(comparison.exitCode).toBe(COMPLETED_EXIT_CODE);
	expect(await claudeEntries(home)).toEqual(before);
}

/**
 * The case declares only the output style, so an arm whose sessions find the
 * rest of its corpus installed ran with the actual setup, and a candidate
 * whose skill shares a name with the live one finds its own bytes.
 */
async function installsEachArmsWholeCorpusInItsSessions(): Promise<void> {
	const prepared = await workspace();
	const { env, root, candidate, control } = prepared;
	await runCli(["settings", "--spend-ceiling-usd", "1"], "empty", env);
	const arms = {
		baseline: [],
		candidate: ["--corpus", candidate],
		control: ["--corpus", control],
	};

	await Array.fromAsync(Object.entries(arms), async ([arm, corpus]) => {
		await confirmationGroup(armEnvironment(prepared, arm), corpus);
	});

	expect({
		baseline: await installedCorpus(join(root, "baseline.log")),
		candidate: await installedCorpus(join(root, "candidate.log")),
		control: await installedCorpus(join(root, "control.log")),
	}).toEqual({
		baseline: [
			"./CLAUDE.md\tlive instructions",
			"./agents/reviewer.md\tlive agent",
			"./output-styles/brief.md\tlive brief",
			"./rulebook/ownership.md\tlive rule",
			"./skills/probe/SKILL.md\tlive skill",
		],
		candidate: [
			"./CLAUDE.md\tcandidate instructions",
			"./output-styles/brief.md\tcandidate brief",
			"./rulebook/ownership.md\tcandidate rule",
			"./skills/probe/SKILL.md\tcandidate skill",
		],
		control: ["./output-styles/brief.md\tcontrol brief"],
	});
}

describe("a comparison run with the actual setup", () => {
	it(
		"leaves every Claude file of the home byte-identical",
		leavesEveryClaudeFileOfTheHomeByteIdentical,
		COMPARISON_TIMEOUT_MS,
	);

	it(
		"installs each arm's whole corpus in its sessions",
		installsEachArmsWholeCorpusInItsSessions,
		COMPARISON_TIMEOUT_MS,
	);
});
