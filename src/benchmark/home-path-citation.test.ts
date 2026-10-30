import { describe, expect, it } from "bun:test";

import deliverHomePathCitations from "#benchmark/home-path-citation";
import type { HomePathCitationMap } from "#benchmark/home-path-citation";

const HOME = "/home/user";

const map: HomePathCitationMap = {
	home: HOME,
	roots: [
		{ layoutPath: "rulebook", path: "/home/user/.agents/rulebook" },
		{ layoutPath: "skills", path: "/home/user/.agents/skills" },
		{ layoutPath: "rulebook", path: "/home/user/.claude/rulebook" },
		{ layoutPath: "skills", path: "/home/user/.claude/skills" },
		{ layoutPath: "CLAUDE.md", path: "/home/user/.agents/AGENTS.md" },
	],
};

const held = new Set(["CLAUDE.md", "rulebook", "skills/x"]);

function delivered(text: string): ReturnType<typeof deliverHomePathCitations> {
	return deliverHomePathCitations(text, map, held);
}

describe(deliverHomePathCitations.name, () => {
	it.each([
		["~/.agents/rulebook/ownership.md", ".claude/rulebook/ownership.md"],
		["$HOME/.agents/rulebook/ownership.md", ".claude/rulebook/ownership.md"],
		[`\${HOME}/.agents/rulebook/ownership.md`, ".claude/rulebook/ownership.md"],
		[
			"/home/user/.agents/rulebook/ownership.md",
			".claude/rulebook/ownership.md",
		],
		["~/.claude/rulebook/ownership.md", ".claude/rulebook/ownership.md"],
		["$HOME/.claude/skills/x/SKILL.md", ".claude/skills/x/SKILL.md"],
		["~/.agents/AGENTS.md", ".claude/CLAUDE.md"],
		["~/.agents/rulebook/", ".claude/rulebook/"],
		["~/.agents/rulebook", ".claude/rulebook"],
		["~/.agents/rulebook/testing/", ".claude/rulebook/testing/"],
		[
			"~/.agents/skills/../rulebook/ownership.md",
			".claude/rulebook/ownership.md",
		],
		["~/.agents/rulebook/removed.md", ".claude/rulebook/removed.md"],
		["~/.agents/skills/x/", ".claude/skills/x/"],
	])("redirects %s to %s", (citation, redirected) => {
		expect(delivered(`read ${citation} first`)).toEqual({
			redirected: 1,
			text: `read ${redirected} first`,
		});
	});
});

describe(deliverHomePathCitations.name, () => {
	it.each([
		["a skill the install does not hold", "~/.agents/skills/y/SKILL.md"],
		["a file outside the corpus layout", "~/.agents/backlog-config.yml"],
		["the bare live root", "~/.claude"],
		["a path under the live root outside the layout", "$HOME/.claude/projects"],
		["a path that climbs out of every root", "~/.agents/rulebook/../../x.md"],
		["a tilde inside a word", "a~/.agents/rulebook/ownership.md"],
		["a parent step out of a root", "~/.agents/rulebook/.."],
		["a directory the install holds only in part", "~/.agents/skills/"],
		["the same directory without its slash", "~/.agents/skills"],
	])("leaves %s as written", (_name, citation) => {
		expect(delivered(`see ${citation} now`)).toEqual({
			redirected: 0,
			text: `see ${citation} now`,
		});
	});

	it("keeps the sentence's closing period outside the citation", () => {
		expect(delivered("Read ~/.agents/rulebook/ownership.md.")).toEqual({
			redirected: 1,
			text: "Read .claude/rulebook/ownership.md.",
		});
	});

	it("counts every citation it redirects", () => {
		const text =
			"`cd ~/.agents/rulebook && cat ownership.md`, then ~/.agents/skills/x/SKILL.md and ~/.agents/skills/y/SKILL.md";

		expect(delivered(text)).toEqual({
			redirected: 2,
			text: "`cd .claude/rulebook && cat ownership.md`, then .claude/skills/x/SKILL.md and ~/.agents/skills/y/SKILL.md",
		});
	});
});
