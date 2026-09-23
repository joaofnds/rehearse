import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { casesRoot, readCaseDeclaration } from "#benchmark/case";
import type { JsonValue } from "#benchmark/json-value";
import type { TranscriptLine } from "#benchmark/transcript";
import { parseTranscript, parseTranscriptFile } from "#benchmark/transcript";
import {
	corpusEntries,
	observedManifest,
	projectEntries,
	reconcileManifest,
} from "#benchmark/context-manifest";

function transcript(
	...records: readonly JsonValue[]
): readonly TranscriptLine[] {
	return parseTranscript(
		records.map((record) => JSON.stringify(record)).join("\n"),
	);
}

function toolCall(id: string, name: string, input: JsonValue): JsonValue {
	return {
		type: "assistant",
		message: { content: [{ type: "tool_use", id, name, input }] },
	};
}

function skillUse(skill: string): JsonValue {
	return toolCall("toolu_skill", "Skill", { skill });
}

function readUse(filePath: string): JsonValue {
	return toolCall("toolu_read", "Read", { file_path: filePath });
}

function bashUse(): JsonValue {
	return toolCall("toolu_bash", "Bash", { command: "ls" });
}

function outputStyle(style: string): JsonValue {
	return { type: "attachment", attachment: { type: "output_style", style } };
}

function slashCommand(name: string): JsonValue {
	return {
		type: "user",
		message: {
			content: `<command-message>${name}</command-message>\n<command-name>/${name}</command-name>`,
		},
	};
}

const VERIFY_DIRECTORY = "/tmp/rehearse-attempt/.claude/skills/verify";

function skillBody(directory: string): JsonValue {
	return {
		type: "user",
		isMeta: true,
		message: {
			content: [
				{
					type: "text",
					text: `Base directory for this skill: ${directory}\n\nReply with the token.`,
				},
			],
		},
	};
}

function errorResult(toolUseId: string): JsonValue {
	return {
		type: "user",
		message: {
			content: [
				{
					type: "tool_result",
					tool_use_id: toolUseId,
					is_error: true,
					content: "<tool_use_error>Refused.</tool_use_error>",
				},
			],
		},
	};
}

function instructions(path: string): JsonValue {
	return {
		type: "attachment",
		attachment: {
			type: "instructions",
			files: [{ path, type: "Project", content: "# Instructions" }],
		},
	};
}

describe(observedManifest.name, () => {
	it("names the layout path of a skill a Skill call loads", () => {
		expect(
			observedManifest(
				transcript(skillUse("verify"), skillBody(VERIFY_DIRECTORY)),
			).paths,
		).toContainEqual({ path: "skills/verify/SKILL.md", half: "corpus" });
	});

	it("names no skill path for a skill only offered, never invoked", () => {
		expect(observedManifest(transcript(bashUse())).paths).toEqual([]);
	});

	it("names CLAUDE.md when the session loads it as instructions", () => {
		expect(
			observedManifest(
				transcript(instructions("/tmp/rehearse-attempt/.claude/CLAUDE.md")),
			).paths,
		).toContainEqual({ path: "CLAUDE.md", half: "corpus" });
	});

	it("names a declared project CLAUDE.md the session loads as instructions as project-half", () => {
		expect(
			observedManifest(
				transcript(instructions("/tmp/rehearse-attempt/CLAUDE.md")),
				["CLAUDE.md"],
			).paths,
		).toEqual([{ path: "CLAUDE.md", half: "project" }]);
	});

	it("names the layout path of a skill a slash command loads", () => {
		expect(
			observedManifest(
				transcript(slashCommand("verify"), skillBody(VERIFY_DIRECTORY)),
			).paths,
		).toContainEqual({ path: "skills/verify/SKILL.md", half: "corpus" });
	});

	it("names no skill path for a Skill call the session refused", () => {
		expect(
			observedManifest(
				transcript(
					toolCall("toolu_refused", "Skill", { skill: "verify" }),
					errorResult("toolu_refused"),
				),
			).paths,
		).toEqual([]);
	});

	it("keeps a skill a slash command loaded when a later Skill call for it is refused", () => {
		expect(
			observedManifest(
				transcript(
					slashCommand("verify"),
					skillBody(VERIFY_DIRECTORY),
					toolCall("toolu_refused", "Skill", { skill: "verify" }),
					errorResult("toolu_refused"),
				),
			).paths,
		).toEqual([{ path: "skills/verify/SKILL.md", half: "corpus" }]);
	});

	it("names no path for a Read whose result is an error", () => {
		expect(
			observedManifest(
				transcript(
					toolCall("toolu_failed", "Read", {
						file_path: "/tmp/rehearse-attempt/.claude/CLAUDE.md",
					}),
					errorResult("toolu_failed"),
				),
			).paths,
		).toEqual([]);
	});

	it("names the layout path of a corpus file read directly", () => {
		expect(
			observedManifest(transcript(readUse("skills/verify/SKILL.md"))).paths,
		).toContainEqual({ path: "skills/verify/SKILL.md", half: "corpus" });
	});

	it("names CLAUDE.md read directly, the corpus layout's other kind of path", () => {
		expect(
			observedManifest(transcript(readUse("CLAUDE.md"))).paths,
		).toContainEqual({
			path: "CLAUDE.md",
			half: "corpus",
		});
	});

	it("names the layout path of a corpus file the session read by its real, absolute path", () => {
		expect(
			observedManifest(
				transcript(readUse("/Users/joaofnds/.claude/skills/verify/SKILL.md")),
			).paths,
		).toContainEqual({ path: "skills/verify/SKILL.md", half: "corpus" });
	});

	it("names the layout path of a rulebook file read by its real, absolute path", () => {
		expect(
			observedManifest(
				transcript(readUse("/Users/joaofnds/.claude/rulebook/coding-style.md")),
			).paths,
		).toContainEqual({ path: "rulebook/coding-style.md", half: "corpus" });
	});

	it("names no path for a Read of a file outside the corpus install's .claude layout and outside the declared project files", () => {
		expect(
			observedManifest(transcript(readUse("/tmp/attempt/NOTES.md")), []).paths,
		).toEqual([]);
	});

	it("tags a declared project file's Read path as project-half, named by its fixture-relative path", () => {
		expect(
			observedManifest(transcript(readUse("/tmp/attempt/NOTES.md")), [
				"NOTES.md",
			]).paths,
		).toContainEqual({ path: "NOTES.md", half: "project" });
	});

	it("tags a declared project file's Read path as project-half when the read path is exactly the declared path", () => {
		expect(
			observedManifest(transcript(readUse("NOTES.md")), ["NOTES.md"]).paths,
		).toContainEqual({ path: "NOTES.md", half: "project" });
	});

	it("tags a Read matching both a corpus layout name and a declared project file's name as corpus-half only, never both", () => {
		const manifest = observedManifest(
			transcript(readUse("/tmp/attempt/.claude/CLAUDE.md")),
			["CLAUDE.md"],
		);

		expect(manifest.paths).toEqual([{ path: "CLAUDE.md", half: "corpus" }]);
	});

	it("names the last output_style attachment's layout path, not an earlier one", () => {
		expect(
			observedManifest(transcript(outputStyle("brief"), outputStyle("concise")))
				.paths,
		).toContainEqual({
			path: "output-styles/concise.md",
			half: "corpus",
		});
		expect(
			observedManifest(transcript(outputStyle("brief"), outputStyle("concise")))
				.paths,
		).not.toContainEqual({ path: "output-styles/brief.md", half: "corpus" });
	});

	it("names no output-style path for a transcript with no output_style attachment", () => {
		expect(observedManifest(transcript()).paths).toEqual([]);
	});

	it("deduplicates a path reached by more than one route", () => {
		const manifest = observedManifest(
			transcript(
				skillBody(VERIFY_DIRECTORY),
				readUse("skills/verify/SKILL.md"),
			),
		);

		expect(
			manifest.paths.filter((entry) => entry.path === "skills/verify/SKILL.md"),
		).toHaveLength(1);
	});
});

describe(reconcileManifest.name, () => {
	it("reports no divergence when the manifest matches the declaration exactly", () => {
		const manifest = observedManifest(
			transcript(skillBody(VERIFY_DIRECTORY), outputStyle("brief")),
		);

		expect(
			reconcileManifest(
				manifest,
				corpusEntries(["skills/verify/SKILL.md", "output-styles/brief.md"]),
			),
		).toEqual([]);
	});

	it("reports an undeclared-file divergence for a loaded path the declaration omits", () => {
		const manifest = observedManifest(transcript(skillBody(VERIFY_DIRECTORY)));

		expect(reconcileManifest(manifest, [])).toEqual([
			{
				kind: "undeclared-file",
				path: "skills/verify/SKILL.md",
				half: "corpus",
			},
		]);
	});

	it("reports an unloaded-file divergence for a declared path the manifest never shows", () => {
		const manifest = observedManifest(transcript());

		expect(
			reconcileManifest(manifest, corpusEntries(["skills/verify/SKILL.md"])),
		).toEqual([
			{ kind: "unloaded-file", path: "skills/verify/SKILL.md", half: "corpus" },
		]);
	});

	it("reports an unloaded-file divergence for a declared rulebook file the session never read", () => {
		const manifest = observedManifest(transcript());

		expect(
			reconcileManifest(manifest, corpusEntries(["rulebook/coding-style.md"])),
		).toEqual([
			{
				kind: "unloaded-file",
				path: "rulebook/coding-style.md",
				half: "corpus",
			},
		]);
	});

	it("reports an unloaded-file divergence for a declared project file the session never read, tagged project-half", () => {
		const manifest = observedManifest(transcript(), []);

		expect(
			reconcileManifest(manifest, [{ path: "NOTES.md", half: "project" }]),
		).toEqual([{ kind: "unloaded-file", path: "NOTES.md", half: "project" }]);
	});

	it("reports an undeclared-file divergence for a project-half Read the case never declared, tagged project-half", () => {
		const manifest = observedManifest(
			transcript(readUse("/tmp/attempt/NOTES.md")),
			["NOTES.md"],
		);

		expect(reconcileManifest(manifest, [])).toEqual([
			{ kind: "undeclared-file", path: "NOTES.md", half: "project" },
		]);
	});
});

describe("a transcript record of an unrecognized type", () => {
	it("yields no manifest entry and no divergence, never a failed attempt", () => {
		const manifest = observedManifest(
			transcript({ type: "future-record-kind", payload: { skill: "verify" } }),
		);

		expect(manifest.paths).toEqual([]);
		expect(reconcileManifest(manifest, [])).toEqual([]);
	});
});

describe("over the manifest-probe fixture", () => {
	it("builds the manifest from disk records alone and reconciles it against the case's declaration", async () => {
		const declaration = await readCaseDeclaration("manifest-probe");
		if (
			declaration.kind !== "session" ||
			declaration.transcript === undefined
		) {
			throw new Error(
				"manifest-probe is expected to be a session case with a transcript",
			);
		}

		const transcriptPath = join(
			casesRoot(),
			"manifest-probe",
			declaration.transcript.file,
		);
		const lines = await parseTranscriptFile(transcriptPath);

		const manifest = observedManifest(lines, declaration.projectFiles);

		expect(
			manifest.paths.toSorted((left, right) =>
				left.path.localeCompare(right.path),
			),
		).toEqual([
			{ path: "NOTES.md", half: "project" },
			{ path: "output-styles/brief.md", half: "corpus" },
			{ path: "skills/verify/SKILL.md", half: "corpus" },
		]);
		expect(
			reconcileManifest(manifest, [
				...corpusEntries(declaration.corpusFiles),
				...projectEntries(declaration.projectFiles),
			]),
		).toEqual([]);
	});
});
