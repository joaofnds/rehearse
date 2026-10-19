import { describe, expect, it } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SessionCase } from "#benchmark/case";
import type { ResolvedCorpusFile } from "#benchmark/corpus-file";
import { jsonObjectSchema } from "#benchmark/json-value";
import {
	sessionLineage,
	sessionUpstreamDigest,
} from "#benchmark/session-lineage";
import { TestResources } from "#benchmark/test-support";

import {
	SessionLineageCaseBuilder,
	settings,
} from "./session-lineage-case-test-builder";

const SHA256_HEX_CHARACTERS = 64;

const testResources = TestResources.forEachTest();

function corpus(sha256: string): readonly ResolvedCorpusFile[] {
	return [
		{ path: "output-styles/brief.md", resolvedPath: "/style.md", sha256 },
	];
}

const ORIGINAL = "a".repeat(SHA256_HEX_CHARACTERS);

const EDITED = "b".repeat(SHA256_HEX_CHARACTERS);

async function digestOf(path: string): Promise<string> {
	return new Bun.CryptoHasher("sha256")
		.update(await Bun.file(path).bytes())
		.digest("hex");
}

const sessionUpstreamDigestKeepsTheDigestRecordedForTheOrderedSessionInputs =
	async (): Promise<void> => {
		expect(
			await sessionUpstreamDigest(new SessionLineageCaseBuilder({}).build()),
		).toBe("e4a86356bbb7e2ac779f16edccfa927690a8dfbb4db6e731315fa661fcd890f1");
	};

const sessionLineageIsUnchangedWhenDeclaredSettingsDifferOnlyInKeyOrder =
	async (): Promise<void> => {
		const declared = new SessionLineageCaseBuilder({}).build();
		const reversedSettings = jsonObjectSchema.parse(
			JSON.parse('{"beta":2,"alpha":1}'),
		);
		const [before, after] = await Promise.all([
			sessionLineage(
				{ ...declared, settings: { alpha: 1, beta: 2 } },
				corpus(ORIGINAL),
				settings,
			),
			sessionLineage(
				{
					...declared,
					settings: reversedSettings,
				},
				corpus(ORIGINAL),
				settings,
			),
		]);

		expect(after).toBe(before);
	};

const sessionLineageChangesWhenADeclaredCorpusFilesBytesChange =
	async (): Promise<void> => {
		const [before, after] = await Promise.all([
			sessionLineage(
				new SessionLineageCaseBuilder({}).build(),
				corpus(ORIGINAL),
				settings,
			),
			sessionLineage(
				new SessionLineageCaseBuilder({}).build(),
				corpus(EDITED),
				settings,
			),
		]);

		expect(after).not.toBe(before);
	};

const sessionLineageIsUnchangedWhenAnUndeclaredFileBesideADeclaredCorpusFileChanges =
	async (): Promise<void> => {
		const installed = await mkdtemp(join(tmpdir(), "rehearse-corpus-"));
		testResources.track(installed);
		const declared = join(installed, "declared.md");
		await writeFile(declared, "declared\n");
		const declaredCorpus = [
			{
				path: "output-styles/declared.md",
				resolvedPath: declared,
				sha256: await digestOf(declared),
			},
		];

		const before = await sessionLineage(
			new SessionLineageCaseBuilder({}).build(),
			declaredCorpus,
			settings,
		);
		await writeFile(join(installed, "undeclared.md"), "undeclared\n");
		const after = await sessionLineage(
			new SessionLineageCaseBuilder({}).build(),
			declaredCorpus,
			settings,
		);

		expect(after).toBe(before);
	};

const sessionLineageChangesWhenThePromptChanges = async (): Promise<void> => {
	const other: SessionCase = {
		...new SessionLineageCaseBuilder({}).build(),
		prompt: "Say something else.",
	};

	const [before, after] = await Promise.all([
		sessionLineage(
			new SessionLineageCaseBuilder({}).build(),
			corpus(ORIGINAL),
			settings,
		),
		sessionLineage(other, corpus(ORIGINAL), settings),
	]);

	expect(after).not.toBe(before);
};

const sessionLineageChangesWhenTheSettingsOverlayChanges =
	async (): Promise<void> => {
		const other: SessionCase = {
			...new SessionLineageCaseBuilder({}).build(),
			settings: { outputStyle: "brief" },
		};

		const [before, after] = await Promise.all([
			sessionLineage(
				new SessionLineageCaseBuilder({}).build(),
				corpus(ORIGINAL),
				settings,
			),
			sessionLineage(other, corpus(ORIGINAL), settings),
		]);

		expect(after).not.toBe(before);
	};

const sessionLineageChangesWhenTheDeclaredProjectFilesListChanges =
	async (): Promise<void> => {
		const other: SessionCase = {
			...new SessionLineageCaseBuilder({}).build(),
			projectFiles: ["NOTES.md"],
		};

		const [before, after] = await Promise.all([
			sessionLineage(
				new SessionLineageCaseBuilder({}).build(),
				corpus(ORIGINAL),
				settings,
			),
			sessionLineage(other, corpus(ORIGINAL), settings),
		]);

		expect(after).not.toBe(before);
	};

const sessionLineageChangesWhenTheTranscriptDigestChanges =
	async (): Promise<void> => {
		const withTranscript: SessionCase = {
			...new SessionLineageCaseBuilder({}).build(),
			declaration: {
				...new SessionLineageCaseBuilder({}).build().declaration,
				transcript: {
					cut: 3,
					file: "p.jsonl",
					sha256: EDITED,
					sourceSession: "s",
				},
			},
		};

		const [before, after] = await Promise.all([
			sessionLineage(
				new SessionLineageCaseBuilder({}).build(),
				corpus(ORIGINAL),
				settings,
			),
			sessionLineage(withTranscript, corpus(ORIGINAL), settings),
		]);

		expect(after).not.toBe(before);
	};
describe("session declared input lineage", () => {
	it(
		"keeps the digest recorded for the ordered session inputs",
		sessionUpstreamDigestKeepsTheDigestRecordedForTheOrderedSessionInputs,
	);
	it(
		"is unchanged when declared settings differ only in key order",
		sessionLineageIsUnchangedWhenDeclaredSettingsDifferOnlyInKeyOrder,
	);
	it(
		"changes when a declared corpus file's bytes change",
		sessionLineageChangesWhenADeclaredCorpusFilesBytesChange,
	);
	it(
		"is unchanged when an undeclared file beside a declared corpus file changes",
		sessionLineageIsUnchangedWhenAnUndeclaredFileBesideADeclaredCorpusFileChanges,
	);
	it(
		"changes when the prompt changes",
		sessionLineageChangesWhenThePromptChanges,
	);
	it(
		"changes when the settings overlay changes",
		sessionLineageChangesWhenTheSettingsOverlayChanges,
	);
	it(
		"changes when the declared project files list changes",
		sessionLineageChangesWhenTheDeclaredProjectFilesListChanges,
	);
	it(
		"changes when the transcript digest changes",
		sessionLineageChangesWhenTheTranscriptDigestChanges,
	);
});
