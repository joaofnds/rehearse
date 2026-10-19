import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";

import { redactedFilePath } from "./redact-path";

describe(redactedFilePath.name, () => {
	test(
		"keeps the file's own name and drops the directory it sat in",
		verifyKeepsTheFileSOwnNameAndDropsTheDirectoryItSatIn,
	);

	test(
		"distinguishes two files that shared a directory",
		verifyDistinguishesTwoFilesThatSharedADirectory,
	);

	test(
		"leaves nothing of a directory whose name contains a space",
		verifyLeavesNothingOfADirectoryWhoseNameContainsASpace,
	);

	test(
		"redacts a path whose root this process cannot know",
		verifyRedactsAPathWhoseRootThisProcessCannotKnow,
	);

	test(
		"redacts a Windows-style absolute path",
		verifyRedactsAWindowsStyleAbsolutePath,
	);

	test("leaves a relative path as it is", verifyLeavesARelativePathAsItIs);
});

function verifyKeepsTheFileSOwnNameAndDropsTheDirectoryItSatIn(): void {
	const instructionsPath = join(homedir(), ".claude", "CLAUDE.md");
	expect(redactedFilePath(instructionsPath)).toBe("<path>/CLAUDE.md");
}

function verifyDistinguishesTwoFilesThatSharedADirectory(): void {
	const claudePath = join(homedir(), ".claude", "CLAUDE.md");
	const agentsPath = join(homedir(), ".claude", "AGENTS.md");

	const redactedClaudePath = redactedFilePath(claudePath);
	const redactedAgentsPath = redactedFilePath(agentsPath);

	expect([redactedClaudePath, redactedAgentsPath]).toEqual([
		"<path>/CLAUDE.md",
		"<path>/AGENTS.md",
	]);
}

function verifyLeavesNothingOfADirectoryWhoseNameContainsASpace(): void {
	const instructionsPath = join(
		homedir(),
		"Library",
		"Application Support",
		"CLAUDE.md",
	);
	expect(redactedFilePath(instructionsPath)).toBe("<path>/CLAUDE.md");
}

function verifyRedactsAPathWhoseRootThisProcessCannotKnow(): void {
	expect(redactedFilePath("/home/someone/my project/AGENTS.md")).toBe(
		"<path>/AGENTS.md",
	);
}

function verifyRedactsAWindowsStyleAbsolutePath(): void {
	expect(redactedFilePath(String.raw`C:\Users\alice\CLAUDE.md`)).toBe(
		"<path>/CLAUDE.md",
	);
}

function verifyLeavesARelativePathAsItIs(): void {
	expect(redactedFilePath("skills/build/SKILL.md")).toBe(
		"skills/build/SKILL.md",
	);
}
