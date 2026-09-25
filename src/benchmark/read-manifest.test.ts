import { describe, expect, it } from "bun:test";
import { corpusEntries, projectEntries } from "#benchmark/context-manifest";
import { stageReadManifest } from "#benchmark/read-manifest";

describe("stageReadManifest", () => {
	it("gives each file the stage declared or loaded one role and its recorded hash", () => {
		const manifest = stageReadManifest({
			skill: "shape",
			corpusFiles: [
				{ path: "CLAUDE.md", sha256: "a".repeat(64) },
				{ path: "skills/shape/SKILL.md", sha256: "b".repeat(64) },
				{ path: "rulebook/style.md", sha256: "c".repeat(64) },
			],
			versionFiles: [],
			targetFiles: [{ path: "CLAUDE.md", sha256: "d".repeat(64) }],
			rubric: { path: "rubrics/shape.json", sha256: "e".repeat(64) },
			observed: {
				paths: [
					...corpusEntries(["skills/shape/SKILL.md", "rulebook/style.md"]),
					...projectEntries(["CLAUDE.md"]),
				],
			},
		});

		expect(manifest).toEqual([
			{
				path: "CLAUDE.md",
				half: "corpus",
				role: "global instructions",
				evidence: "declared",
				sha256: "a".repeat(64),
			},
			{
				path: "skills/shape/SKILL.md",
				half: "corpus",
				role: "stage skill",
				evidence: "declared and observed",
				sha256: "b".repeat(64),
			},
			{
				path: "rubrics/shape.json",
				half: "rubric",
				role: "judge rubric",
				evidence: "declared",
				sha256: "e".repeat(64),
			},
			{
				path: "rulebook/style.md",
				half: "corpus",
				role: "read for context",
				evidence: "observed",
				sha256: "c".repeat(64),
			},
			{
				path: "CLAUDE.md",
				half: "project",
				role: "project instructions",
				evidence: "observed",
				sha256: "d".repeat(64),
			},
		]);
	});

	it("leaves the hash out of a target file the starting checkpoint did not hold", () => {
		const manifest = stageReadManifest({
			skill: "shape",
			corpusFiles: [],
			versionFiles: [],
			targetFiles: [],
			rubric: undefined,
			observed: { paths: projectEntries(["AGENTS.md"]) },
		});

		expect(manifest).toContainEqual({
			path: "AGENTS.md",
			half: "project",
			role: "project instructions",
			evidence: "observed",
		});
	});

	it("hashes a corpus file the stage loaded beyond its captured files from the version it started at", () => {
		const manifest = stageReadManifest({
			skill: "build",
			corpusFiles: [{ path: "skills/build/SKILL.md", sha256: "a".repeat(64) }],
			versionFiles: [
				{ path: "skills/build/SKILL.md", sha256: "a".repeat(64) },
				{ path: "skills/delivery/SKILL.md", sha256: "b".repeat(64) },
			],
			targetFiles: [],
			rubric: undefined,
			observed: { paths: corpusEntries(["skills/delivery/SKILL.md"]) },
		});

		expect(manifest).toContainEqual({
			path: "skills/delivery/SKILL.md",
			half: "corpus",
			role: "read for context",
			evidence: "observed",
			sha256: "b".repeat(64),
		});
	});
});
