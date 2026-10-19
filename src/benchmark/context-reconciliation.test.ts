import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { casesRoot, readCaseDeclaration } from "#benchmark/case";
import {
	corpusEntries,
	observedManifest,
	projectEntries,
	reconcileManifest,
} from "#benchmark/context-manifest";
import { parseTranscriptFile } from "#benchmark/transcript";

import ManifestTranscriptBuilder from "./manifest-transcript-test-builder";

const VERIFY_DIRECTORY = "/tmp/rehearse-attempt/.claude/skills/verify";
const reconcileManifestReportsNoDivergenceWhenTheManifestMatchesTheDeclarationExactly =
	(): void => {
		const manifest = observedManifest(
			new ManifestTranscriptBuilder()
				.skillBody(VERIFY_DIRECTORY)
				.outputStyle("brief")
				.build(),
		);

		expect(
			reconcileManifest(
				manifest,
				corpusEntries(["skills/verify/SKILL.md", "output-styles/brief.md"]),
			),
		).toEqual([]);
	};

const reconcileManifestReportsAnUndeclaredfileDivergenceForALoadedPathTheDeclarationOmits =
	(): void => {
		const manifest = observedManifest(
			new ManifestTranscriptBuilder().skillBody(VERIFY_DIRECTORY).build(),
		);

		expect(reconcileManifest(manifest, [])).toEqual([
			{
				half: "corpus",
				kind: "undeclared-file",
				path: "skills/verify/SKILL.md",
			},
		]);
	};

const reconcileManifestReportsAnUnloadedfileDivergenceForADeclaredPathTheManifestNeverShows =
	(): void => {
		const manifest = observedManifest(new ManifestTranscriptBuilder().build());

		expect(
			reconcileManifest(manifest, corpusEntries(["skills/verify/SKILL.md"])),
		).toEqual([
			{ half: "corpus", kind: "unloaded-file", path: "skills/verify/SKILL.md" },
		]);
	};

const reconcileManifestReportsAnUnloadedfileDivergenceForADeclaredRulebookFileTheSessionNeverRead =
	(): void => {
		const manifest = observedManifest(new ManifestTranscriptBuilder().build());

		expect(
			reconcileManifest(manifest, corpusEntries(["rulebook/coding-style.md"])),
		).toEqual([
			{
				half: "corpus",
				kind: "unloaded-file",
				path: "rulebook/coding-style.md",
			},
		]);
	};

const reconcileManifestReportsAnUnloadedfileDivergenceForADeclaredProjectFileTheSessionNeverReadTaggedProjecthalf =
	(): void => {
		const manifest = observedManifest(
			new ManifestTranscriptBuilder().build(),
			[],
		);

		expect(
			reconcileManifest(manifest, [{ half: "project", path: "NOTES.md" }]),
		).toEqual([{ half: "project", kind: "unloaded-file", path: "NOTES.md" }]);
	};

const reconcileManifestReportsAnUndeclaredfileDivergenceForAProjecthalfReadTheCaseNeverDeclaredTaggedProjecthalf =
	(): void => {
		const manifest = observedManifest(
			new ManifestTranscriptBuilder().readUse("/tmp/attempt/NOTES.md").build(),
			["NOTES.md"],
		);

		expect(reconcileManifest(manifest, [])).toEqual([
			{ half: "project", kind: "undeclared-file", path: "NOTES.md" },
		]);
	};

const aTranscriptRecordOfAnUnrecognizedTypeYieldsNoManifestEntryAndNoDivergenceNeverA =
	(): void => {
		const manifest = observedManifest(
			new ManifestTranscriptBuilder()
				.withRecord({
					payload: { skill: "verify" },
					type: "future-record-kind",
				})
				.build(),
		);

		expect(manifest.paths).toEqual([]);
		expect(reconcileManifest(manifest, [])).toEqual([]);
	};

const overTheManifestprobeFixtureBuildsTheManifestFromDiskRecordsAloneAndReconcilesItAgainstThe =
	async (): Promise<void> => {
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
			{ half: "project", path: "NOTES.md" },
			{ half: "corpus", path: "output-styles/brief.md" },
			{ half: "corpus", path: "skills/verify/SKILL.md" },
		]);
		expect(
			reconcileManifest(manifest, [
				...corpusEntries(declaration.corpusFiles),
				...projectEntries(declaration.projectFiles),
			]),
		).toEqual([]);
	};
describe(reconcileManifest.name, () => {
	it(
		"reports no divergence when the manifest matches the declaration exactly",
		reconcileManifestReportsNoDivergenceWhenTheManifestMatchesTheDeclarationExactly,
	);

	it(
		"reports an undeclared-file divergence for a loaded path the declaration omits",
		reconcileManifestReportsAnUndeclaredfileDivergenceForALoadedPathTheDeclarationOmits,
	);

	it(
		"reports an unloaded-file divergence for a declared path the manifest never shows",
		reconcileManifestReportsAnUnloadedfileDivergenceForADeclaredPathTheManifestNeverShows,
	);

	it(
		"reports an unloaded-file divergence for a declared rulebook file the session never read",
		reconcileManifestReportsAnUnloadedfileDivergenceForADeclaredRulebookFileTheSessionNeverRead,
	);

	it(
		"reports an unloaded-file divergence for a declared project file the session never read, tagged project-half",
		reconcileManifestReportsAnUnloadedfileDivergenceForADeclaredProjectFileTheSessionNeverReadTaggedProjecthalf,
	);

	it(
		"reports an undeclared-file divergence for a project-half Read the case never declared, tagged project-half",
		reconcileManifestReportsAnUndeclaredfileDivergenceForAProjecthalfReadTheCaseNeverDeclaredTaggedProjecthalf,
	);
});
describe("a transcript record of an unrecognized type", () => {
	it(
		"yields no manifest entry and no divergence, never a failed attempt",
		aTranscriptRecordOfAnUnrecognizedTypeYieldsNoManifestEntryAndNoDivergenceNeverA,
	);
});
describe("over the manifest-probe fixture", () => {
	it(
		"builds the manifest from disk records alone and reconciles it against the case's declaration",
		overTheManifestprobeFixtureBuildsTheManifestFromDiskRecordsAloneAndReconcilesItAgainstThe,
	);
});
