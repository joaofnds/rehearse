import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SessionCase } from "#benchmark/case";
import type { SessionSettings } from "#benchmark/claude";
import type { ResolvedCorpusFile } from "#benchmark/corpus-file";
import { sessionLineage } from "#benchmark/session-lineage";
import { TestResources } from "#benchmark/test-support";

const testResources = TestResources.forEachTest();

const settings: SessionSettings = {
	model: "haiku",
	effort: "low",
	budgetUsd: 0.2,
};

function sessionCase(fixturePath?: string): SessionCase {
	return {
		kind: "session",
		declaration: {
			id: "probe",
			kind: "session",
			title: "Probe",
			prompt: "Reply with the single word OK.",
			tools: [],
			corpusFiles: ["output-styles/brief.md"],
			projectFiles: [],
			checks: [{ kind: "word-band", max: 1 }],
		},
		fixturePath,
		transcriptPath: undefined,
		prompt: "Reply with the single word OK.",
		tools: [],
		settings: undefined,
		agents: undefined,
		corpusFiles: ["output-styles/brief.md"],
		projectFiles: [],
		checks: [{ kind: "word-band", max: 1 }],
	};
}

function corpus(sha256: string): readonly ResolvedCorpusFile[] {
	return [
		{ path: "output-styles/brief.md", resolvedPath: "/style.md", sha256 },
	];
}

const ORIGINAL = "a".repeat(64);
const EDITED = "b".repeat(64);

async function digestOf(path: string): Promise<string> {
	return new Bun.CryptoHasher("sha256")
		.update(await Bun.file(path).bytes())
		.digest("hex");
}

describe(sessionLineage.name, () => {
	/**
	 * A settings block written in another key order is the same settings, so two
	 * arms that differ only that way must stay comparable. The recorded
	 * `settingsDigest` already reads them as one; a lineage that disagreed would
	 * refuse the comparison while every named input read equal.
	 */
	it("is unchanged when declared settings differ only in key order", async () => {
		const declared = sessionCase();
		const [before, after] = await Promise.all([
			sessionLineage(
				{ ...declared, settings: { alpha: 1, beta: 2 } },
				corpus(ORIGINAL),
				settings,
			),
			sessionLineage(
				{ ...declared, settings: { beta: 2, alpha: 1 } },
				corpus(ORIGINAL),
				settings,
			),
		]);

		expect(after).toBe(before);
	});

	it("changes when a declared corpus file's bytes change", async () => {
		const [before, after] = await Promise.all([
			sessionLineage(sessionCase(), corpus(ORIGINAL), settings),
			sessionLineage(sessionCase(), corpus(EDITED), settings),
		]);

		expect(after).not.toBe(before);
	});

	/**
	 * AC 21's second half: an undeclared file beside a declared corpus file must
	 * not reach the key. The corpus arm resolves and hashes the declared file
	 * for real, so writing a neighbour into the same directory would change the
	 * key if the lineage read the directory rather than the declaration.
	 */
	it("is unchanged when an undeclared file beside a declared corpus file changes", async () => {
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
			sessionCase(),
			declaredCorpus,
			settings,
		);
		await writeFile(join(installed, "undeclared.md"), "undeclared\n");
		const after = await sessionLineage(sessionCase(), declaredCorpus, settings);

		expect(after).toBe(before);
	});

	it("is unchanged when a file beside the fixture tree changes", async () => {
		const root = await mkdtemp(join(tmpdir(), "rehearse-lineage-"));
		testResources.track(root);
		const fixture = join(root, "fixture");
		await mkdir(fixture, { recursive: true });
		await writeFile(join(fixture, "declared.md"), "declared\n");

		const before = await sessionLineage(
			sessionCase(fixture),
			corpus(ORIGINAL),
			settings,
		);
		await writeFile(join(root, "beside.md"), "beside\n");
		const after = await sessionLineage(
			sessionCase(fixture),
			corpus(ORIGINAL),
			settings,
		);

		expect(after).toBe(before);
	});

	it("changes when the fixture tree's bytes change", async () => {
		const fixture = await mkdtemp(join(tmpdir(), "rehearse-lineage-"));
		testResources.track(fixture);
		await writeFile(join(fixture, "seed.md"), "one\n");
		const before = await sessionLineage(
			sessionCase(fixture),
			corpus(ORIGINAL),
			settings,
		);

		await writeFile(join(fixture, "seed.md"), "two\n");
		const after = await sessionLineage(
			sessionCase(fixture),
			corpus(ORIGINAL),
			settings,
		);

		expect(after).not.toBe(before);
	});

	it("changes when the prompt changes", async () => {
		const other: SessionCase = {
			...sessionCase(),
			prompt: "Say something else.",
		};

		const [before, after] = await Promise.all([
			sessionLineage(sessionCase(), corpus(ORIGINAL), settings),
			sessionLineage(other, corpus(ORIGINAL), settings),
		]);

		expect(after).not.toBe(before);
	});

	it("changes when the settings overlay changes", async () => {
		const other: SessionCase = {
			...sessionCase(),
			settings: { outputStyle: "brief" },
		};

		const [before, after] = await Promise.all([
			sessionLineage(sessionCase(), corpus(ORIGINAL), settings),
			sessionLineage(other, corpus(ORIGINAL), settings),
		]);

		expect(after).not.toBe(before);
	});

	it("changes when the declared project files list changes", async () => {
		const other: SessionCase = {
			...sessionCase(),
			projectFiles: ["NOTES.md"],
		};

		const [before, after] = await Promise.all([
			sessionLineage(sessionCase(), corpus(ORIGINAL), settings),
			sessionLineage(other, corpus(ORIGINAL), settings),
		]);

		expect(after).not.toBe(before);
	});

	it("changes when the transcript digest changes", async () => {
		const withTranscript: SessionCase = {
			...sessionCase(),
			declaration: {
				...sessionCase().declaration,
				transcript: {
					file: "p.jsonl",
					sha256: EDITED,
					sourceSession: "s",
					cut: 3,
				},
			},
		};

		const [before, after] = await Promise.all([
			sessionLineage(sessionCase(), corpus(ORIGINAL), settings),
			sessionLineage(withTranscript, corpus(ORIGINAL), settings),
		]);

		expect(after).not.toBe(before);
	});
});
