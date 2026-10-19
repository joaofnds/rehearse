import { describe, expect, it } from "bun:test";

import { observedManifest } from "#benchmark/context-manifest";

import ManifestTranscriptBuilder from "./manifest-transcript-test-builder";

const VERIFY_DIRECTORY = "/tmp/rehearse-attempt/.claude/skills/verify";
const observedManifestNamesTheLayoutPathOfASkillASkillCallLoads = (): void => {
	const manifestPaths = observedManifest(
		new ManifestTranscriptBuilder()
			.skillUse("verify")
			.skillBody(VERIFY_DIRECTORY)
			.build(),
	).paths;

	expect(manifestPaths).toContainEqual({
		half: "corpus",
		path: "skills/verify/SKILL.md",
	});
};

const observedManifestNamesNoSkillPathForASkillOnlyOfferedNeverInvoked =
	(): void => {
		const manifestPaths = observedManifest(
			new ManifestTranscriptBuilder().bashUse().build(),
		).paths;

		expect(manifestPaths).toEqual([]);
	};

const observedManifestNamesTheLayoutPathOfASkillASlashCommandLoads =
	(): void => {
		const manifestPaths = observedManifest(
			new ManifestTranscriptBuilder()
				.slashCommand("verify")
				.skillBody(VERIFY_DIRECTORY)
				.build(),
		).paths;

		expect(manifestPaths).toContainEqual({
			half: "corpus",
			path: "skills/verify/SKILL.md",
		});
	};

const observedManifestNamesNoSkillPathForASkillCallTheSessionRefused =
	(): void => {
		const manifestPaths = observedManifest(
			new ManifestTranscriptBuilder()
				.toolCall("toolu_refused", "Skill", { skill: "verify" })
				.errorResult("toolu_refused")
				.build(),
		).paths;

		expect(manifestPaths).toEqual([]);
	};

const observedManifestKeepsASkillASlashCommandLoadedWhenALaterSkillCallForItIs =
	(): void => {
		const manifestPaths = observedManifest(
			new ManifestTranscriptBuilder()
				.slashCommand("verify")
				.skillBody(VERIFY_DIRECTORY)
				.toolCall("toolu_refused", "Skill", { skill: "verify" })
				.errorResult("toolu_refused")
				.build(),
		).paths;

		expect(manifestPaths).toEqual([
			{ half: "corpus", path: "skills/verify/SKILL.md" },
		]);
	};

const observedManifestNamesTheLastOutput_styleAttachmentsLayoutPathNotAnEarlierOne =
	(): void => {
		const manifestPaths = observedManifest(
			new ManifestTranscriptBuilder()
				.outputStyle("brief")
				.outputStyle("concise")
				.build(),
		).paths;

		expect(manifestPaths).toContainEqual({
			half: "corpus",
			path: "output-styles/concise.md",
		});
		const manifestPaths2 = observedManifest(
			new ManifestTranscriptBuilder()
				.outputStyle("brief")
				.outputStyle("concise")
				.build(),
		).paths;
		expect(manifestPaths2).not.toContainEqual({
			half: "corpus",
			path: "output-styles/brief.md",
		});
	};

const observedManifestNamesNoOutputstylePathForATranscriptWithNoOutput_styleAttachment =
	(): void => {
		expect(
			observedManifest(new ManifestTranscriptBuilder().build()).paths,
		).toEqual([]);
	};

const observedManifestDeduplicatesAPathReachedByMoreThanOneRoute = (): void => {
	const expectedPathCount = 1;

	const manifest = observedManifest(
		new ManifestTranscriptBuilder()
			.skillBody(VERIFY_DIRECTORY)
			.readUse("skills/verify/SKILL.md")
			.build(),
	);

	expect(
		manifest.paths.filter((entry) => entry.path === "skills/verify/SKILL.md"),
	).toHaveLength(expectedPathCount);
};
describe("loaded corpus context", () => {
	it(
		"names the layout path of a skill a Skill call loads",
		observedManifestNamesTheLayoutPathOfASkillASkillCallLoads,
	);
	it(
		"names no skill path for a skill only offered, never invoked",
		observedManifestNamesNoSkillPathForASkillOnlyOfferedNeverInvoked,
	);
	it(
		"names the layout path of a skill a slash command loads",
		observedManifestNamesTheLayoutPathOfASkillASlashCommandLoads,
	);
	it(
		"names no skill path for a Skill call the session refused",
		observedManifestNamesNoSkillPathForASkillCallTheSessionRefused,
	);
	it(
		"keeps a skill a slash command loaded when a later Skill call for it is refused",
		observedManifestKeepsASkillASlashCommandLoadedWhenALaterSkillCallForItIs,
	);
	it(
		"names the last output_style attachment's layout path, not an earlier one",
		observedManifestNamesTheLastOutput_styleAttachmentsLayoutPathNotAnEarlierOne,
	);
	it(
		"names no output-style path for a transcript with no output_style attachment",
		observedManifestNamesNoOutputstylePathForATranscriptWithNoOutput_styleAttachment,
	);
	it(
		"deduplicates a path reached by more than one route",
		observedManifestDeduplicatesAPathReachedByMoreThanOneRoute,
	);
});
