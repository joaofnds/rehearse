import { describe, expect, it } from "bun:test";

import type { HomePathCitationMap } from "#benchmark/home-path-citation";
import liveCorpusReads from "#benchmark/live-corpus-reads";
import type { ToolUse } from "#benchmark/transcript-message-contract";

const citations: HomePathCitationMap = {
	home: "/home/user",
	roots: [
		{ layoutPath: "rulebook", path: "/home/user/.agents/rulebook" },
		{ layoutPath: "skills", path: "/home/user/.agents/skills" },
	],
};

const held = new Set(["rulebook/ownership.md", "skills/x/SKILL.md"]);

function use(name: string, input: Readonly<Record<string, string>>): ToolUse {
	return { input: { ...input }, name, type: "tool_use" };
}

describe(liveCorpusReads.name, () => {
	it("counts each file-access call that names a held file's live copy", () => {
		const uses = [
			use("Read", { file_path: "/home/user/.agents/rulebook/ownership.md" }),
			use("Bash", { command: "cat ~/.agents/rulebook/ownership.md" }),
			use("Bash", { command: "cd ~/.agents/rulebook && cat ownership.md" }),
			use("Grep", { path: "/home/user/.agents/skills/x", pattern: "y" }),
		];

		expect(liveCorpusReads(uses, citations, held)).toEqual([
			{ count: 1, path: "rulebook" },
			{ count: 2, path: "rulebook/ownership.md" },
			{ count: 1, path: "skills/x" },
		]);
	});

	it.each([
		[
			"the install's own copy",
			use("Read", { file_path: ".claude/rulebook/ownership.md" }),
		],
		[
			"a file the install does not hold",
			use("Read", { file_path: "/home/user/.agents/skills/y/SKILL.md" }),
		],
		[
			"a mention in an agent prompt",
			use("Agent", { prompt: "read ~/.agents/rulebook/ownership.md" }),
		],
		[
			"a mention in written content",
			use("Write", {
				content: "~/.agents/rulebook/ownership.md",
				file_path: "/tmp/notes.md",
			}),
		],
	])("does not count %s", (_name, call) => {
		expect(liveCorpusReads([call], citations, held)).toEqual([]);
	});
});
