import { describe, expect, it } from "bun:test";

import { observedManifest } from "#benchmark/context-manifest";

import ManifestTranscriptBuilder from "./manifest-transcript-test-builder";

const observedManifestNamesCLAUDEmdWhenTheSessionLoadsItAsInstructions =
	(): void => {
		const manifestPaths = observedManifest(
			new ManifestTranscriptBuilder()
				.instructions("/tmp/rehearse-attempt/.claude/CLAUDE.md")
				.build(),
		).paths;

		expect(manifestPaths).toContainEqual({ half: "corpus", path: "CLAUDE.md" });
	};

const observedManifestNamesADeclaredProjectCLAUDEmdTheSessionLoadsAsInstructionsAsProjecthalf =
	(): void => {
		const manifestPaths = observedManifest(
			new ManifestTranscriptBuilder()
				.instructions("/tmp/rehearse-attempt/CLAUDE.md")
				.build(),
			["CLAUDE.md"],
		).paths;

		expect(manifestPaths).toEqual([{ half: "project", path: "CLAUDE.md" }]);
	};

const observedManifestNamesNoPathForAReadWhoseResultIsAnError = (): void => {
	const manifestPaths = observedManifest(
		new ManifestTranscriptBuilder()
			.toolCall("toolu_failed", "Read", {
				file_path: "/tmp/rehearse-attempt/.claude/CLAUDE.md",
			})
			.errorResult("toolu_failed")
			.build(),
	).paths;

	expect(manifestPaths).toEqual([]);
};

const observedManifestNamesTheLayoutPathOfACorpusFileReadDirectly =
	(): void => {
		const manifestPaths = observedManifest(
			new ManifestTranscriptBuilder().readUse("skills/verify/SKILL.md").build(),
		).paths;

		expect(manifestPaths).toContainEqual({
			half: "corpus",
			path: "skills/verify/SKILL.md",
		});
	};

const observedManifestNamesCLAUDEmdReadDirectlyTheCorpusLayoutsOtherKindOfPath =
	(): void => {
		const manifestPaths = observedManifest(
			new ManifestTranscriptBuilder().readUse("CLAUDE.md").build(),
		).paths;

		expect(manifestPaths).toContainEqual({
			half: "corpus",
			path: "CLAUDE.md",
		});
	};

const observedManifestNamesTheLayoutPathOfACorpusFileTheSessionReadByItsRealAbsolute =
	(): void => {
		const manifestPaths = observedManifest(
			new ManifestTranscriptBuilder()
				.readUse("/Users/joaofnds/.claude/skills/verify/SKILL.md")
				.build(),
		).paths;

		expect(manifestPaths).toContainEqual({
			half: "corpus",
			path: "skills/verify/SKILL.md",
		});
	};

const observedManifestNamesTheLayoutPathOfARulebookFileReadByItsRealAbsolutePath =
	(): void => {
		const manifestPaths = observedManifest(
			new ManifestTranscriptBuilder()
				.readUse("/Users/joaofnds/.claude/rulebook/coding-style.md")
				.build(),
		).paths;

		expect(manifestPaths).toContainEqual({
			half: "corpus",
			path: "rulebook/coding-style.md",
		});
	};

const observedManifestNamesNoPathForAReadOfAFileOutsideTheCorpusInstallsClaudeLayout =
	(): void => {
		const manifestPaths = observedManifest(
			new ManifestTranscriptBuilder().readUse("/tmp/attempt/NOTES.md").build(),
			[],
		).paths;

		expect(manifestPaths).toEqual([]);
	};

const observedManifestTagsADeclaredProjectFilesReadPathAsProjecthalfNamedByItsFixturerelativePath =
	(): void => {
		const manifestPaths = observedManifest(
			new ManifestTranscriptBuilder().readUse("/tmp/attempt/NOTES.md").build(),
			["NOTES.md"],
		).paths;

		expect(manifestPaths).toContainEqual({ half: "project", path: "NOTES.md" });
	};

const observedManifestTagsADeclaredProjectFilesReadPathAsProjecthalfWhenTheReadPathIsExactly =
	(): void => {
		const manifestPaths = observedManifest(
			new ManifestTranscriptBuilder().readUse("NOTES.md").build(),
			["NOTES.md"],
		).paths;

		expect(manifestPaths).toContainEqual({ half: "project", path: "NOTES.md" });
	};

const observedManifestTagsAReadMatchingBothACorpusLayoutNameAndADeclaredProjectFilesName =
	(): void => {
		const manifest = observedManifest(
			new ManifestTranscriptBuilder()
				.readUse("/tmp/attempt/.claude/CLAUDE.md")
				.build(),
			["CLAUDE.md"],
		);

		expect(manifest.paths).toEqual([{ half: "corpus", path: "CLAUDE.md" }]);
	};
describe("loaded project instructions", () => {
	it(
		"names CLAUDE.md when the session loads it as instructions",
		observedManifestNamesCLAUDEmdWhenTheSessionLoadsItAsInstructions,
	);
	it(
		"names a declared project CLAUDE.md the session loads as instructions as project-half",
		observedManifestNamesADeclaredProjectCLAUDEmdTheSessionLoadsAsInstructionsAsProjecthalf,
	);
});
describe("context read attribution", () => {
	it(
		"names no path for a Read whose result is an error",
		observedManifestNamesNoPathForAReadWhoseResultIsAnError,
	);
	it(
		"names the layout path of a corpus file read directly",
		observedManifestNamesTheLayoutPathOfACorpusFileReadDirectly,
	);
	it(
		"names CLAUDE.md read directly, the corpus layout's other kind of path",
		observedManifestNamesCLAUDEmdReadDirectlyTheCorpusLayoutsOtherKindOfPath,
	);
	it(
		"names the layout path of a corpus file the session read by its real, absolute path",
		observedManifestNamesTheLayoutPathOfACorpusFileTheSessionReadByItsRealAbsolute,
	);
	it(
		"names the layout path of a rulebook file read by its real, absolute path",
		observedManifestNamesTheLayoutPathOfARulebookFileReadByItsRealAbsolutePath,
	);
	it(
		"names no path for a Read of a file outside the corpus install's .claude layout and outside the declared project files",
		observedManifestNamesNoPathForAReadOfAFileOutsideTheCorpusInstallsClaudeLayout,
	);
	it(
		"tags a declared project file's Read path as project-half, named by its fixture-relative path",
		observedManifestTagsADeclaredProjectFilesReadPathAsProjecthalfNamedByItsFixturerelativePath,
	);
	it(
		"tags a declared project file's Read path as project-half when the read path is exactly the declared path",
		observedManifestTagsADeclaredProjectFilesReadPathAsProjecthalfWhenTheReadPathIsExactly,
	);
	it(
		"tags a Read matching both a corpus layout name and a declared project file's name as corpus-half only, never both",
		observedManifestTagsAReadMatchingBothACorpusLayoutNameAndADeclaredProjectFilesName,
	);
});
