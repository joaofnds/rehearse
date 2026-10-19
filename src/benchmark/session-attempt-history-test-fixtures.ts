import { appendFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCommand } from "#benchmark/command";
import STORED_GIT_DIRECTORY from "#benchmark/git-directory-name";

const GIT_OBJECT_DIRECTORY_PREFIX_CHARACTERS = 2;

const FIRST_RECORDED_COMMIT_INDEX = 0;

const PREFIX_START_INDEX = 0;

const breakages = [
	{
		corrupt: async (history: string) => {
			await appendFile(
				join(history, "config"),
				`[core]\n\tworktree = ${tmpdir()}\n`,
			);
		},
		name: "points its work tree outside the attempt directory",
		stderr: "resolves to",
	},
	{
		corrupt: async (history: string, commits: readonly string[]) => {
			const ancestor = commits[FIRST_RECORDED_COMMIT_INDEX] ?? "";
			await rm(
				join(
					history,
					"objects",
					ancestor.slice(
						PREFIX_START_INDEX,
						GIT_OBJECT_DIRECTORY_PREFIX_CHARACTERS,
					),
					ancestor.slice(GIT_OBJECT_DIRECTORY_PREFIX_CHARACTERS),
				),
			);
		},
		name: "is missing an ancestor object",
		stderr: "Could not read",
	},
	{
		corrupt: async (history: string) => {
			await writeFile(join(history, "index"), "not an index");
		},
		name: "holds a corrupt index",
		stderr: "index file smaller than expected",
	},
] as const;

const hidings = [
	{
		hide: async () => {
			// The history fixture's last commit already tracks it.
		},
		history: ["first", "score"],
		name: "the current commit tracks it",
		scorer: "score.md",
	},
	{
		hide: async (fixture: string) => {
			await gitInFixture(fixture, ["rm", "--cached", "--quiet", "score.md"]);
			await gitInFixture(fixture, ["commit", "--quiet", "-m", "untrack"]);
			await writeFile(join(fixture, "score.md"), "rewritten\n");
		},
		history: ["first", "score"],
		name: "an earlier commit carried it with other bytes",
		scorer: "score.md",
	},
	{
		hide: async (fixture: string) => {
			await gitInFixture(fixture, ["rm", "--cached", "--quiet", "score.md"]);
			await gitInFixture(fixture, ["commit", "--quiet", "-m", "untrack"]);
			await writeFile(join(fixture, "score.md"), "rewritten\n");
		},
		history: ["first", "score"],
		name: "the command spells it from the fixture root",
		scorer: "./score.md",
	},
	{
		hide: async (fixture: string) => {
			await gitInFixture(fixture, ["checkout", "--quiet", "-b", "side"]);
			await writeFile(join(fixture, "score.md"), "side answers\n");
			await gitInFixture(fixture, ["add", "score.md"]);
			await gitInFixture(fixture, ["commit", "--quiet", "-m", "side"]);
			await gitInFixture(fixture, ["checkout", "--quiet", "main"]);
			await writeFile(join(fixture, "score.md"), "rewritten\n");
		},
		history: ["first"],
		name: "only another branch carried it",
		scorer: "score.md",
	},
	{
		hide: async (fixture: string) => {
			await writeFile(join(fixture, "score.md"), "old answers\n");
			await gitInFixture(fixture, ["add", "score.md"]);
			await gitInFixture(fixture, ["commit", "--quiet", "-m", "draft"]);
			await gitInFixture(fixture, ["reset", "--quiet", "--hard", "HEAD~1"]);
			await writeFile(join(fixture, "score.md"), "new answers\n");
		},
		history: ["first"],
		name: "only the reflog reaches the commit that carried it",
		scorer: "score.md",
	},
	{
		hide: async (fixture: string) => {
			await writeFile(join(fixture, "copy.md"), "first\n");
		},
		history: ["first"],
		name: "a commit carried its bytes under another name",
		scorer: "copy.md",
	},
	{
		hide: async (fixture: string) => {
			await writeFile(join(fixture, "draft.md"), "draft answers\n");
			await gitInFixture(fixture, ["hash-object", "-w", "--", "draft.md"]);
		},
		history: ["first"],
		name: "only a loose object holds its bytes",
		scorer: "draft.md",
	},
] as const;

async function gitInFixture(
	fixture: string,
	args: readonly string[],
): Promise<string> {
	return await runCommand(
		[
			"git",
			"--git-dir",
			join(fixture, STORED_GIT_DIRECTORY),
			"--work-tree",
			fixture,
			...args,
		],
		fixture,
	);
}

export { breakages, hidings };
