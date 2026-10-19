import { describe, expect, it } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ResolvedCorpusFile } from "#benchmark/corpus-file";
import { sessionLineage } from "#benchmark/session-lineage";
import { TestResources } from "#benchmark/test-support";

import {
	SessionLineageCaseBuilder,
	settings,
} from "./session-lineage-case-test-builder";

const SHA256_HEX_CHARACTER_COUNT = 64;

const SHA256_HEX_CHARACTERS = 64;

const testResources = TestResources.forEachTest();

function corpus(sha256: string): readonly ResolvedCorpusFile[] {
	return [
		{ path: "output-styles/brief.md", resolvedPath: "/style.md", sha256 },
	];
}

const theLineageADeclaredStateCheckProducesDiffersFromTheLineageRecordedWhileTheSessionCould =
	async (): Promise<void> => {
		const fixture = await mkdtemp(join(tmpdir(), "rehearse-lineage-"));
		testResources.track(fixture);
		await writeFile(join(fixture, "score.sh"), "exit 0\n");
		await writeFile(join(fixture, "LEDGER.md"), "ledger\n");

		const lineage = await sessionLineage(
			new SessionLineageCaseBuilder({
				fixturePath: fixture,
				stateCheck: {
					command: ["sh", "score.sh"],
					outcomes: ["tree-clean"],
				},
			}).build(),
			corpus("a".repeat(SHA256_HEX_CHARACTERS)),
			settings,
		);

		expect(lineage).not.toBe(
			"954e19887a90bc818c750f588f6693c34631c790d653ee026ee89661e79e7ea5",
		);
	};

const theLineageADeclaredStateCheckProducesIsUnchangedWhenTheScorerItNamesLiesOutside =
	async (): Promise<void> => {
		const lineage = await sessionLineage(
			new SessionLineageCaseBuilder({
				fixturePath: undefined,
				stateCheck: {
					command: ["sh", "score.sh"],
					outcomes: ["tree-clean"],
				},
			}).build(),
			corpus("a".repeat(SHA256_HEX_CHARACTERS)),
			settings,
		);

		expect(lineage).toBe(
			"9a215f3a87ef26c1b897bbcb177d15d817f1280973cff6dfb9bbba8b85612ef4",
		);
	};

const theLineageADeclaredStateCheckProducesDiffersFromTheLineageOfTheSameCaseDeclaring =
	async (): Promise<void> => {
		const withoutStateCheck = sessionLineage(
			new SessionLineageCaseBuilder({}).build(),
			corpus("a".repeat(SHA256_HEX_CHARACTER_COUNT)),
			settings,
		);
		const withStateCheck = sessionLineage(
			new SessionLineageCaseBuilder({
				fixturePath: undefined,
				stateCheck: {
					command: ["sh", "score.sh"],
					outcomes: ["tree-clean"],
				},
			}).build(),
			corpus("a".repeat(SHA256_HEX_CHARACTER_COUNT)),
			settings,
		);
		const [without, with_] = await Promise.all([
			withoutStateCheck,
			withStateCheck,
		]);

		expect(with_).not.toBe(without);
	};

const theLineageADeclaredStateCheckProducesDiffersBetweenTwoCasesWhoseScorerCommandsDiffer =
	async (): Promise<void> => {
		const firstLineage = sessionLineage(
			new SessionLineageCaseBuilder({
				fixturePath: undefined,
				stateCheck: {
					command: ["sh", "score.sh"],
					outcomes: ["tree-clean"],
				},
			}).build(),
			corpus("a".repeat(SHA256_HEX_CHARACTERS)),
			settings,
		);
		const secondLineage = sessionLineage(
			new SessionLineageCaseBuilder({
				fixturePath: undefined,
				stateCheck: {
					command: ["sh", "edited-score.sh"],
					outcomes: ["tree-clean"],
				},
			}).build(),
			corpus("a".repeat(SHA256_HEX_CHARACTERS)),
			settings,
		);
		const [first, second] = await Promise.all([firstLineage, secondLineage]);

		expect(second).not.toBe(first);
	};

const theLineageADeclaredStateCheckProducesDiffersBetweenTwoCasesWhoseDeclaredOutcomesDiffer =
	async (): Promise<void> => {
		const firstLineage = sessionLineage(
			new SessionLineageCaseBuilder({
				fixturePath: undefined,
				stateCheck: {
					command: ["sh", "score.sh"],
					outcomes: ["tree-clean"],
				},
			}).build(),
			corpus("a".repeat(SHA256_HEX_CHARACTERS)),
			settings,
		);
		const secondLineage = sessionLineage(
			new SessionLineageCaseBuilder({
				fixturePath: undefined,
				stateCheck: {
					command: ["sh", "score.sh"],
					outcomes: ["tree-clean", "cards-archived"],
				},
			}).build(),
			corpus("a".repeat(SHA256_HEX_CHARACTERS)),
			settings,
		);
		const [first, second] = await Promise.all([firstLineage, secondLineage]);

		expect(second).not.toBe(first);
	};
describe("the lineage a declared state check produces", () => {
	it(
		"differs from the lineage recorded while the session could read its scorer",
		theLineageADeclaredStateCheckProducesDiffersFromTheLineageRecordedWhileTheSessionCould,
	);
	it(
		"is unchanged when the scorer it names lies outside the fixture",
		theLineageADeclaredStateCheckProducesIsUnchangedWhenTheScorerItNamesLiesOutside,
	);
	it(
		"differs from the lineage of the same case declaring no state check",
		theLineageADeclaredStateCheckProducesDiffersFromTheLineageOfTheSameCaseDeclaring,
	);
	it(
		"differs between two cases whose scorer commands differ",
		theLineageADeclaredStateCheckProducesDiffersBetweenTwoCasesWhoseScorerCommandsDiffer,
	);
	it(
		"differs between two cases whose declared outcomes differ",
		theLineageADeclaredStateCheckProducesDiffersBetweenTwoCasesWhoseDeclaredOutcomesDiffer,
	);
});
